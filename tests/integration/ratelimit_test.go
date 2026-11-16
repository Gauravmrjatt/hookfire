package integration

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"

	"hookfire/internal/config"
	"hookfire/internal/ratelimit"
)

// newTestLimiter returns a limiter against the shared dev Redis plus a cleanup
// that removes only the keys the test touches.
func newTestLimiter(t *testing.T, endpointID string, rate int, burst float64) *ratelimit.Limiter {
	t.Helper()
	url := testRedisURL(t)
	limiter, err := ratelimit.New(config.Config{
		RedisURL:             url,
		DefaultRateLimit:     rate,
		RateLimitBurstFactor: burst,
	})
	if err != nil {
		t.Fatalf("new limiter: %v", err)
	}
	t.Cleanup(func() {
		client, err := redis.ParseURL(url)
		if err == nil {
			rdb := redis.NewClient(client)
			rdb.Del(context.Background(), "hookfire:ratelimit:"+endpointID)
			rdb.Close()
		}
		_ = limiter.Close()
	})
	return limiter
}

// TestRateLimiterEnforcesQuota guards the bug where the Lua script returned a
// two-element table while the caller read a single integer: every Eval
// errored and the caller failed open, so the limiter never denied anything.
func TestRateLimiterEnforcesQuota(t *testing.T) {
	endpoint := fmt.Sprintf("it-ratelimit-burst-%d", time.Now().UnixNano())
	limiter := newTestLimiter(t, endpoint, 5, 1) // capacity 5
	ctx := context.Background()

	allowed, denied := 0, 0
	for i := 0; i < 12; i++ {
		ok, err := limiter.Allow(ctx, endpoint, 0)
		if err != nil {
			t.Fatalf("Allow returned a Redis error — the caller would fail open: %v", err)
		}
		if ok {
			allowed++
		} else {
			denied++
		}
	}
	if allowed != 5 {
		t.Errorf("allowed %d requests from a burst of 12 at capacity 5; want 5", allowed)
	}
	if denied != 7 {
		t.Errorf("denied %d requests; want 7", denied)
	}
}

// TestRateLimiterRefills verifies the bucket actually refills, so a limited
// endpoint recovers instead of being throttled forever.
func TestRateLimiterRefills(t *testing.T) {
	endpoint := fmt.Sprintf("it-ratelimit-refill-%d", time.Now().UnixNano())
	limiter := newTestLimiter(t, endpoint, 20, 1) // capacity 20, 20 tokens/s
	ctx := context.Background()

	for i := 0; i < 20; i++ {
		ok, err := limiter.Allow(ctx, endpoint, 0)
		if err != nil {
			t.Fatalf("Allow: %v", err)
		}
		if !ok {
			t.Fatalf("request %d denied before the bucket was empty", i+1)
		}
	}
	if ok, err := limiter.Allow(ctx, endpoint, 0); err != nil || ok {
		t.Fatalf("empty bucket: allowed=%v err=%v; want allowed=false, err=nil", ok, err)
	}

	time.Sleep(400 * time.Millisecond) // ~8 tokens at 20/s
	recovered := 0
	for i := 0; i < 5; i++ {
		ok, err := limiter.Allow(ctx, endpoint, 0)
		if err != nil {
			t.Fatalf("Allow after refill: %v", err)
		}
		if ok {
			recovered++
		}
	}
	if recovered < 3 {
		t.Errorf("only %d/5 requests allowed after 400ms at 20 tokens/s; bucket did not refill", recovered)
	}
}
