// Package ratelimit implements per-endpoint rate limiting in Redis
// (PRD §23). A token bucket is kept in Redis (shared across all engine
// instances), refilled at the endpoint's rate and consumed by each delivery.
//
// Failure behavior is explicit and configurable (PRD §23):
// RATE_LIMIT_FAIL_OPEN=true (default) delivers even when Redis is down
// (availability over protection); false holds deliveries back until Redis
// returns (protection over availability).
package ratelimit

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"hookfire/internal/config"
)

// limiterScript is an atomic token bucket. KEYS[1]=bucket key,
// ARGV: rate/sec, capacity, now (seconds float).
const limiterScript = `
local rate     = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local now      = tonumber(ARGV[3])

local state = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(state[1])
local ts     = tonumber(state[2])

if tokens == nil or ts == nil then
	tokens = capacity
	ts     = now
end

-- refill
if now > ts then
	tokens = math.min(capacity, tokens + (now - ts) * rate)
end

local allowed = 0
if tokens >= 1 then
	tokens  = tokens - 1
	allowed = 1
end

redis.call('HMSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', KEYS[1], math.max(2, math.ceil(capacity / math.max(rate, 0.001)) * 2))
return {allowed, tostring(tokens)}
`

// Limiter decides whether a delivery to an endpoint is allowed right now.
// A nil *Limiter means rate limiting is disabled entirely (documented
// behavior when REDIS_URL is unset).
type Limiter struct {
	rdb         *redis.Client
	defaultRate int
	burstFactor float64
}

func New(cfg config.Config) (*Limiter, error) {
	if cfg.RedisURL == "" {
		return nil, nil
	}
	opts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	rdb := redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("ping redis: %w", err)
	}
	return &Limiter{
		rdb:         rdb,
		defaultRate: cfg.DefaultRateLimit,
		burstFactor: cfg.RateLimitBurstFactor,
	}, nil
}

// Close releases the Redis connection.
func (l *Limiter) Close() error {
	if l == nil {
		return nil
	}
	return l.rdb.Close()
}

// Ping is used by the readiness endpoint.
func (l *Limiter) Ping(ctx context.Context) error {
	if l == nil {
		return nil
	}
	return l.rdb.Ping(ctx).Err()
}

// Allow consumes one token for the endpoint. rate<=0 uses the engine default
// (PRD §23: DEFAULT_RATE_LIMIT). The returned error is a Redis failure, not
// "over quota" — the caller decides fail-open vs fail-closed.
func (l *Limiter) Allow(ctx context.Context, endpointID string, rate int) (bool, error) {
	if l == nil {
		return true, nil // rate limiting disabled
	}
	if rate <= 0 {
		rate = l.defaultRate
	}
	if rate <= 0 {
		return true, nil
	}
	capacity := float64(rate) * l.burstFactor
	if capacity < 1 {
		capacity = 1
	}
	allowed, err := l.rdb.Eval(ctx, limiterScript,
		[]string{"hookfire:ratelimit:" + endpointID},
		rate, capacity, float64(time.Now().UnixNano())/1e9).Int()
	if err != nil {
		return false, fmt.Errorf("rate limit eval: %w", err)
	}
	return allowed == 1, nil
}
