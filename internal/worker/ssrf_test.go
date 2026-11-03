package worker

import (
	"context"
	"testing"
)

// TestSSRFValidation covers URL validation before outbound delivery (PRD §31).
// IP-literal hosts exercise the forbidden-ranges without DNS.
func TestSSRFValidation(t *testing.T) {
	blocked := []string{
		"http://127.0.0.1:8080/webhooks",     // loopback
		"http://10.0.0.5/webhooks",           // RFC1918
		"http://192.168.1.10/webhooks",       // RFC1918
		"http://172.16.0.9/webhooks",         // RFC1918
		"http://169.254.169.254/latest/meta", // cloud metadata (link-local)
		"http://0.0.0.0/webhooks",            // unspecified
		"http://[::1]/webhooks",              // IPv6 loopback
		"http://[fe80::1]/webhooks",          // IPv6 link-local
		"http://[fc00::1]/webhooks",          // IPv6 unique-local
		"file:///etc/passwd",                 // wrong scheme
		"gopher://10.0.0.1/",                 // wrong scheme
		"http:///nohost",                     // missing host
	}
	allowed := []string{
		"https://8.8.8.8/webhooks",
		"https://example.com/webhooks", // DNS-based check runs, but a public resolution passes
	}

	s := NewSender(testConfig(false), discardLogger())
	for _, u := range blocked {
		if err := s.ValidateDestination(context.Background(), u); err == nil {
			t.Errorf("URL %q should be blocked", u)
		}
	}
	for _, u := range allowed {
		if err := s.ValidateDestination(context.Background(), u); err != nil {
			t.Errorf("URL %q should be allowed: %v", u, err)
		}
	}
}

func TestSSRFAllowPrivateFlag(t *testing.T) {
	s := NewSender(testConfig(true), discardLogger()) // local dev / tests only
	if err := s.ValidateDestination(context.Background(), "http://127.0.0.1:9/"); err != nil {
		t.Errorf("ALLOW_PRIVATE_URLS=true should permit loopback: %v", err)
	}
}
