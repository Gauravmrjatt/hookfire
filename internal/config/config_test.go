package config

import (
	"os"
	"testing"
	"time"
)

func TestLoadDefaults(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.HTTPAddr != "0.0.0.0:8080" {
		t.Errorf("HTTPAddr = %q", cfg.HTTPAddr)
	}
	if cfg.WorkerCount != 10 || cfg.QueueSize != 1000 {
		t.Errorf("worker defaults = %d/%d", cfg.WorkerCount, cfg.QueueSize)
	}
	if cfg.InitialRetryDelay != 5*time.Second {
		t.Errorf("InitialRetryDelay = %v", cfg.InitialRetryDelay)
	}
}

func TestLoadMissingJWTSecret(t *testing.T) {
	os.Unsetenv("JWT_SECRET")
	defer os.Setenv("JWT_SECRET", "test-secret")
	if _, err := Load(); err == nil {
		t.Fatal("expected error when JWT_SECRET is missing")
	}
}

func TestLoadEnvParsing(t *testing.T) {
	t.Setenv("JWT_SECRET", "s")
	t.Setenv("PORT", ":9999")
	t.Setenv("MAX_RETRIES", "3")
	t.Setenv("JITTER_FRACTION", "0.1")
	t.Setenv("RETRYABLE_STATUS_CODES", "429,503")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.HTTPAddr != ":9999" || cfg.MaxRetries != 3 || cfg.JitterFraction != 0.1 {
		t.Errorf("env overrides not applied: %+v", cfg)
	}
	if len(cfg.RetryableStatusCodes) != 2 || cfg.RetryableStatusCodes[0] != 429 {
		t.Errorf("RetryableStatusCodes = %v", cfg.RetryableStatusCodes)
	}
}

func TestLoadInvalidValues(t *testing.T) {
	t.Setenv("JWT_SECRET", "s")
	t.Setenv("WORKER_COUNT", "zero")
	if _, err := Load(); err == nil {
		t.Fatal("expected error for WORKER_COUNT=zero")
	}
}
