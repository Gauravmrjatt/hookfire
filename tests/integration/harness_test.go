// Package integration runs end-to-end tests against real PostgreSQL and
// (optionally) Redis (PRD §33). Skipped unless reachable:
//
//	TEST_DATABASE_URL / DATABASE_URL  (default postgres@localhost:5432/webhook_test)
//	TEST_REDIS_URL                    (default redis://localhost:6379)
//
// Spin dependencies up with: make docker-up
package integration

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"hookfire/internal/app"
	"hookfire/internal/config"
	"hookfire/internal/middleware"
)

func testConfig(databaseURL, redisURL string) config.Config {
	return config.Config{
		HTTPAddr:               "127.0.0.1:0",
		Env:                    "test",
		DatabaseURL:            databaseURL,
		RedisURL:               redisURL,
		JWTSecret:              "test-secret",
		JWTExpiration:          time.Hour,
		WorkerCount:            4,
		QueueSize:              100,
		RequestTimeout:         2 * time.Second,
		MaxResponseBytes:       4096,
		MaxRequestBodyBytes:    1 << 20,
		AllowPrivateURLs:       true, // subscribers are httptest servers on 127.0.0.1
		RetryableStatusCodes:   []int{408, 429, 500, 502, 503, 504},
		PermanentStatusCodes:   []int{400, 401, 403, 404, 410},
		MaxRetries:             3,
		InitialRetryDelay:      100 * time.Millisecond,
		MaxRetryDelay:          2 * time.Second,
		BackoffMultiplier:      2,
		JitterFraction:         0, // deterministic waits in tests
		DefaultRateLimit:       1000,
		RateLimitFailOpen:      true,
		DispatcherInterval:     100 * time.Millisecond,
		ClaimBatchSize:         16,
		StaleProcessingTimeout: 5 * time.Second,
		EndpointConcurrency:    1,
		LogLevel:               "error",
		MigrationsDir:          migrationsDir(),
	}
}

func migrationsDir() string {
	if v := os.Getenv("MIGRATIONS_DIR"); v != "" {
		return v
	}
	return "../../migrations"
}

func testDatabaseURL(t *testing.T) string {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		url = "postgres://postgres:postgres@localhost:5432/webhook_test?sslmode=disable"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Skipf("postgres not available for integration tests: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Skipf("postgres not available for integration tests: %v", err)
	}
	pool.Close()
	return url
}

func testRedisURL(t *testing.T) string {
	t.Helper()
	url := os.Getenv("TEST_REDIS_URL")
	if url == "" {
		url = "redis://localhost:6379"
	}
	if opt, err := redis.ParseURL(url); err != nil {
		t.Skipf("bad redis url: %v", err)
	} else {
		client := redis.NewClient(opt)
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		err := client.Ping(ctx).Err()
		cancel()
		client.Close()
		if err != nil {
			t.Skipf("redis not available for integration tests: %v", err)
		}
	}
	return url
}

type harness struct {
	app    *app.App
	server *httptest.Server
	token  string
	dbURL  string
	cancel context.CancelFunc
	t      *testing.T
}

func newHarness(t *testing.T, withRedis bool) *harness {
	t.Helper()
	dbURL := testDatabaseURL(t)
	redisURL := ""
	if withRedis {
		redisURL = testRedisURL(t)
	}

	a, err := app.New(context.Background(), testConfig(dbURL, redisURL))
	if err != nil {
		t.Fatalf("app.New: %v", err)
	}
	truncate(t, dbURL)

	poolCtx, cancel := context.WithCancel(context.Background())
	a.Start(poolCtx)
	server := httptest.NewServer(a.Router)
	token, err := middleware.IssueToken("test-secret", "integration", time.Hour)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	t.Cleanup(func() {
		server.Close()
		cancel()
		a.Pool.Wait()
		a.CloseRedis()
	})
	return &harness{app: a, server: server, token: token, dbURL: dbURL, cancel: cancel, t: t}
}

// do issues an authenticated JSON request against the in-process server.
func (h *harness) do(method, path, body string, headers map[string]string) (int, map[string]any) {
	h.t.Helper()
	req, err := http.NewRequest(method, h.server.URL+path, strings.NewReader(body))
	if err != nil {
		h.t.Fatalf("build request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+h.token)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		h.t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	var parsed map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&parsed)
	return resp.StatusCode, parsed
}

func waitFor(t *testing.T, timeout time.Duration, cond func() bool, msg string) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for: %s", msg)
}

// truncate resets all tables between tests.
func truncate(t *testing.T, dbURL string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("open pool for truncate: %v", err)
	}
	defer pool.Close()
	_, err = pool.Exec(ctx, `TRUNCATE delivery_attempts, deliveries, idempotency_keys, events, endpoints CASCADE`)
	if err != nil {
		t.Fatalf("truncate: %v", err)
	}
}
