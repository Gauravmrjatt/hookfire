// Package config loads all runtime configuration from environment variables
// (PRD §37). Nothing here reads files; secrets come from the environment only.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is the full runtime configuration of the service.
type Config struct {
	// HTTP server
	HTTPAddr string // PORT
	Env      string

	// Backing services
	DatabaseURL string // required; the API must fail rather than accept events it cannot persist
	RedisURL    string // optional; rate limiting is disabled when empty (documented behavior)

	// Auth (PRD §22)
	JWTSecret     string
	JWTExpiration time.Duration

	// Worker pool (PRD §14)
	WorkerCount int
	QueueSize   int

	// Delivery (PRD §17, §18, §30)
	RequestTimeout       time.Duration
	MaxResponseBytes     int64
	MaxRequestBodyBytes  int64
	AllowPrivateURLs     bool // disables SSRF protection; for local dev / tests only
	RetryableStatusCodes []int
	PermanentStatusCodes []int

	// Retry policy (PRD §18)
	MaxRetries        int
	InitialRetryDelay time.Duration
	MaxRetryDelay     time.Duration
	BackoffMultiplier float64
	JitterFraction    float64 // +/- fraction of the computed delay, e.g. 0.25 = +/-25%

	// Rate limiting (PRD §23)
	DefaultRateLimit     int     // per endpoint per second when endpoint.rate_limit = 0
	RateLimitFailOpen    bool    // true = deliver when Redis is unreachable; false = protectively hold back
	RateLimitBurstFactor float64 // token bucket capacity = rate * factor

	// Dispatcher (PRD §26)
	DispatcherInterval     time.Duration
	ClaimBatchSize         int
	StaleProcessingTimeout time.Duration // 'processing' deliveries older than this are re-dispatched
	EndpointConcurrency    int           // concurrent in-flight deliveries per endpoint (1 = best-effort ordering)

	// Observability
	LogLevel string

	// Migrations
	MigrationsDir string
}

// Load builds a Config purely from the environment.
func Load() (Config, error) {
	var (
		c   Config
		err error
	)

	c.HTTPAddr = envOr("PORT", "0.0.0.0:8080")
	c.Env = envOr("ENV", "development")

	c.DatabaseURL = os.Getenv("DATABASE_URL")
	c.RedisURL = os.Getenv("REDIS_URL")

	if c.JWTSecret = os.Getenv("JWT_SECRET"); c.JWTSecret == "" {
		return c, fmt.Errorf("JWT_SECRET is required")
	}
	if c.JWTExpiration, err = envDurationOr("JWT_EXPIRATION", "12h"); err != nil {
		return c, err
	}

	if c.WorkerCount, err = envIntOr("WORKER_COUNT", 10); err != nil {
		return c, err
	}
	if c.QueueSize, err = envIntOr("QUEUE_SIZE", 1000); err != nil {
		return c, err
	}

	if c.RequestTimeout, err = envDurationOr("REQUEST_TIMEOUT", "10s"); err != nil {
		return c, err
	}
	if c.MaxResponseBytes, err = envInt64Or("MAX_RESPONSE_BYTES", 64*1024); err != nil {
		return c, err
	}
	if c.MaxRequestBodyBytes, err = envInt64Or("MAX_REQUEST_BODY_BYTES", 1024*1024); err != nil {
		return c, err
	}
	c.AllowPrivateURLs = envBoolOr("ALLOW_PRIVATE_URLS", false)

	if c.RetryableStatusCodes, err = splitIntList(envOr("RETRYABLE_STATUS_CODES", "408,429,500,502,503,504")); err != nil {
		return c, err
	}
	if c.PermanentStatusCodes, err = splitIntList(envOr("PERMANENT_STATUS_CODES", "400,401,403,404,410")); err != nil {
		return c, err
	}

	if c.MaxRetries, err = envIntOr("MAX_RETRIES", 7); err != nil {
		return c, err
	}
	if c.InitialRetryDelay, err = envDurationOr("INITIAL_RETRY_DELAY", "5s"); err != nil {
		return c, err
	}
	if c.MaxRetryDelay, err = envDurationOr("MAX_RETRY_DELAY", "15m"); err != nil {
		return c, err
	}
	if c.BackoffMultiplier, err = envFloatOr("BACKOFF_MULTIPLIER", 2.0); err != nil {
		return c, err
	}
	if c.JitterFraction, err = envFloatOr("JITTER_FRACTION", 0.25); err != nil {
		return c, err
	}

	if c.DefaultRateLimit, err = envIntOr("DEFAULT_RATE_LIMIT", 100); err != nil {
		return c, err
	}
	c.RateLimitFailOpen = envBoolOr("RATE_LIMIT_FAIL_OPEN", true)
	if c.RateLimitBurstFactor, err = envFloatOr("RATE_LIMIT_BURST_FACTOR", 1.0); err != nil {
		return c, err
	}

	if c.DispatcherInterval, err = envDurationOr("DISPATCHER_INTERVAL", "1s"); err != nil {
		return c, err
	}
	if c.ClaimBatchSize, err = envIntOr("CLAIM_BATCH_SIZE", 64); err != nil {
		return c, err
	}
	if c.StaleProcessingTimeout, err = envDurationOr("STALE_PROCESSING_TIMEOUT", "2m"); err != nil {
		return c, err
	}
	if c.EndpointConcurrency, err = envIntOr("ENDPOINT_CONCURRENCY", 1); err != nil {
		return c, err
	}

	c.LogLevel = envOr("LOG_LEVEL", "info")
	c.MigrationsDir = envOr("MIGRATIONS_DIR", "migrations")

	if c.WorkerCount <= 0 || c.QueueSize <= 0 {
		return c, fmt.Errorf("WORKER_COUNT and QUEUE_SIZE must be positive")
	}
	if c.MaxRetries < 0 {
		return c, fmt.Errorf("MAX_RETRIES must be >= 0")
	}
	return c, nil
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envIntOr(key string, def int) (int, error) {
	v := os.Getenv(key)
	if v == "" {
		return def, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def, fmt.Errorf("%s: invalid integer %q", key, v)
	}
	return n, nil
}

func envFloatOr(key string, def float64) (float64, error) {
	v := os.Getenv(key)
	if v == "" {
		return def, nil
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return def, fmt.Errorf("%s: invalid float %q", key, v)
	}
	return f, nil
}

func envInt64Or(key string, def int64) (int64, error) {
	v := os.Getenv(key)
	if v == "" {
		return def, nil
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return def, fmt.Errorf("%s: invalid integer %q", key, v)
	}
	return n, nil
}

func envBoolOr(key string, def bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return def
	}
	return b
}

func envDurationOr(key, def string) (time.Duration, error) {
	v := os.Getenv(key)
	if v == "" {
		return time.ParseDuration(def)
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return 0, fmt.Errorf("%s: invalid duration %q", key, v)
	}
	return d, nil
}

func splitIntList(s string) ([]int, error) {
	if strings.TrimSpace(s) == "" {
		return nil, nil
	}
	parts := strings.Split(s, ",")
	out := make([]int, 0, len(parts))
	for _, p := range parts {
		n, err := strconv.Atoi(strings.TrimSpace(p))
		if err != nil {
			return nil, fmt.Errorf("invalid status code list %q", s)
		}
		out = append(out, n)
	}
	return out, nil
}
