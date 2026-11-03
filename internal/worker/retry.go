// Package worker implements the asynchronous delivery engine (PRD §14–§20):
// a dispatcher that claims due deliveries from PostgreSQL with FOR UPDATE
// SKIP LOCKED, a channel-based worker pool, an HTTP sender with HMAC
// signatures and SSRF checks, and a durable retry policy with jitter.
package worker

import (
	"math"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// RetryPolicy decides whether a failed attempt is retried and when (PRD §17–§18).
// Status classification is configurable in order to match subscriber behavior.
type RetryPolicy struct {
	MaxRetries      int           // MAX_RETRIES
	InitialDelay    time.Duration // INITIAL_RETRY_DELAY
	MaxDelay        time.Duration // MAX_RETRY_DELAY
	Multiplier      float64       // BACKOFF_MULTIPLIER
	JitterFraction  float64       // +/- fraction, 0..1
	RetryableStatus map[int]bool  // RETRYABLE_STATUS_CODES
	PermanentStatus map[int]bool  // PERMANENT_STATUS_CODES
	rand            *rand.Rand
}

func NewRetryPolicy(maxRetries int, initial, maxDelay time.Duration, multiplier, jitter float64,
	retryable, permanent []int, seed int64) *RetryPolicy {
	return &RetryPolicy{
		MaxRetries:      maxRetries,
		InitialDelay:    initial,
		MaxDelay:        maxDelay,
		Multiplier:      multiplier,
		JitterFraction:  jitter,
		RetryableStatus: toSet(retryable),
		PermanentStatus: toSet(permanent),
		rand:            rand.New(rand.NewSource(seed)),
	}
}

func toSet(codes []int) map[int]bool {
	set := make(map[int]bool, len(codes))
	for _, c := range codes {
		set[c] = true
	}
	return set
}

// Retryable returns true when a failure with the given HTTP status (0 =
// transport error, timeout, connection refused) should be retried (PRD §17).
// Unknown 5xx codes are retried conservatively. An explicitly permanent
// status (4xx by default) is not retried.
func (p *RetryPolicy) Retryable(statusCode int) bool {
	if statusCode == 0 {
		return true // network error / timeout — always retriable
	}
	if p.PermanentStatus[statusCode] {
		return false
	}
	if p.RetryableStatus[statusCode] {
		return true
	}
	return statusCode >= 500
}

// Exhausted reports whether attempts already made reached the retry cap.
// attemptCount is the number of attempts performed so far.
func (p *RetryPolicy) Exhausted(attemptCount int) bool {
	return attemptCount > p.MaxRetries
}

// NextDelay computes the exponential backoff delay after attemptCount failed
// attempts, capped at MaxRetryDelay, with additive/subtractive jitter to
// avoid synchronized retry storms (PRD §18):
//
//	delay = min(base * multiplier^attemptCount, max) ± jitter*delay
func (p *RetryPolicy) NextDelay(attemptCount int) time.Duration {
	base := float64(p.InitialDelay)
	if base <= 0 {
		base = 1
	}
	factor := p.Multiplier
	if factor <= 1 {
		factor = 2
	}
	delay := base * math.Pow(factor, float64(attemptCount))
	if cap := float64(p.MaxDelay); cap > 0 && delay > cap {
		delay = cap
	}
	if p.JitterFraction > 0 {
		// crypto/rand is not needed here: jitter is a timing decision,
		// not a security decision.
		j := delay * p.JitterFraction * (p.rand.Float64()*2 - 1)
		delay += j
	}
	if delay < 0 {
		delay = 0
	}
	return time.Duration(delay)
}

// RetryAfter honors a subscriber's Retry-After header (seconds or HTTP date),
// clamped to the policy maximum. Returns 0 when the header is absent.
func (p *RetryPolicy) RetryAfter(attemptCount int, header string) time.Duration {
	header = strings.TrimSpace(header)
	if header == "" {
		return 0
	}
	if secs, err := strconv.Atoi(header); err == nil {
		if secs < 0 {
			secs = 0
		}
		d := time.Duration(secs) * time.Second
		return p.clamp(d)
	}
	if t, err := http.ParseTime(header); err == nil {
		d := time.Until(t)
		if d < 0 {
			d = 0
		}
		return p.clamp(d)
	}
	return 0
}

func (p *RetryPolicy) clamp(d time.Duration) time.Duration {
	if p.MaxDelay > 0 && d > p.MaxDelay {
		return p.MaxDelay
	}
	return d
}

// RateLimited is returned by the rate limiter when the endpoint is over its
// per-second quota (retryable, does not consume an attempt).
func (p *RetryPolicy) Exceeded(attemptCount int) bool {
	return attemptCount >= p.MaxRetries
}

// TerminalStatus maps a failed attempt to the terminal delivery status.
// Permanent failures AND exhausted retries both go to the dead-letter queue
// so they can be replayed later (PRD §20).
func TerminalStatus() string {
	return "dead_letter"
}
