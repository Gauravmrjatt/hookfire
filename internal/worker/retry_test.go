package worker

import (
	"net/http"
	"testing"
	"time"
)

func newPolicy() *RetryPolicy {
	return NewRetryPolicy(
		7,
		5*time.Second,
		15*time.Minute,
		2.0,
		0.0, // deterministic for these tests
		[]int{408, 429, 500, 502, 503, 504},
		[]int{400, 401, 403, 404, 410},
		1,
	)
}

func TestExponentialBackoffGrowth(t *testing.T) {
	p := newPolicy()
	prev := time.Duration(0)
	for attempt := 0; attempt <= 5; attempt++ {
		d := p.NextDelay(attempt)
		if d <= prev {
			t.Fatalf("delay not increasing: attempt %d gave %v after %v", attempt, d, prev)
		}
		prev = d
	}
	// attempt 0 must equal the initial delay (no jitter)
	if d := p.NextDelay(0); d != 5*time.Second {
		t.Errorf("attempt 0 delay = %v, want 5s", d)
	}
}

func TestDelayCappedAtMax(t *testing.T) {
	p := newPolicy()
	if d := p.NextDelay(30); d != 15*time.Minute {
		t.Errorf("delay = %v, want capped 15m", d)
	}
}

func TestJitterBounds(t *testing.T) {
	p := NewRetryPolicy(7, time.Minute, time.Hour, 1, 0.25, nil, nil, 42)
	for i := 0; i < 200; i++ {
		d := p.NextDelay(0) // base 60s, jitter ±25% => [45s, 75s]
		if d < 45*time.Second || d > 75*time.Second {
			t.Fatalf("jittered delay out of bounds: %v", d)
		}
	}
}

func TestStatusClassification(t *testing.T) {
	p := newPolicy()
	for _, code := range []int{408, 429, 500, 502, 503, 504, 505} {
		if !p.Retryable(code) {
			t.Errorf("status %d should be retryable", code)
		}
	}
	for _, code := range []int{400, 401, 403, 404, 410} {
		if p.Retryable(code) {
			t.Errorf("status %d should be permanent", code)
		}
	}
	if !p.Retryable(0) {
		t.Error("transport errors (status 0) should be retryable")
	}
}

func TestRetryExhausted(t *testing.T) {
	p := newPolicy() // MaxRetries=7 -> 1 initial attempt + 7 retries = 8 total
	if p.Exhausted(0) || p.Exhausted(7) {
		t.Error("not exhausted before the cap")
	}
	if !p.Exhausted(8) || !p.Exhausted(9) {
		t.Error("should be exhausted once MaxRetries retries were already performed")
	}
}

func TestRetryAfterSeconds(t *testing.T) {
	p := newPolicy()
	if d := p.RetryAfter(0, "30"); d != 30*time.Second {
		t.Errorf("RetryAfter= %v, want 30s", d)
	}
	if d := p.RetryAfter(0, "999999"); d != 15*time.Minute {
		t.Errorf("RetryAfter not clamped to max: %v", d)
	}
}

func TestRetryAfterHTTPDate(t *testing.T) {
	p := newPolicy()
	future := time.Now().Add(2 * time.Minute).UTC().Format(http.TimeFormat)
	if d := p.RetryAfter(0, future); d <= 0 || d > 2*time.Minute+time.Second {
		t.Errorf("RetryAfter from date = %v", d)
	}
}

func TestRetryAfterMissing(t *testing.T) {
	p := newPolicy()
	if d := p.RetryAfter(0, ""); d != 0 {
		t.Errorf("empty header should give 0, got %v", d)
	}
}
