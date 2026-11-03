package integration

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

// stubSubscriber is a test subscriber webhook receiver with changeable
// behavior: a fixed status, or a per-call sequence function.
type stubSubscriber struct {
	srv    *httptest.Server
	mu     sync.Mutex
	status int
	fn     func(call int) int
	calls  int
	// lastBody stores the most recent raw body received.
	lastBody string
	// hitCount counts received requests.
	hitCount int
	received chan struct{} // signals each reception
}

func subscriber(t *testing.T, hits *int, status int) *stubSubscriber {
	t.Helper()
	s := &stubSubscriber{status: status, received: make(chan struct{}, 1000)}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		buf := make([]byte, r.ContentLength)
		_, _ = r.Body.Read(buf)
		s.mu.Lock()
		s.calls++
		if hits != nil {
			// only count accepted (2xx) deliveries
			statusCode := s.status
			if s.fn != nil {
				statusCode = s.fn(s.calls)
			}
			if statusCode >= 200 && statusCode < 300 {
				*hits++
			}
		}
		s.lastBody = string(buf)
		statusOut := s.status
		if s.fn != nil {
			statusOut = s.fn(s.calls)
		}
		s.mu.Unlock()
		w.WriteHeader(statusOut)
		s.received <- struct{}{}
	}))
	s.srv = srv
	t.Cleanup(srv.Close)
	return s
}

// URL is the subscriber endpoint URL.
func (s *stubSubscriber) URL() string { return s.srv.URL }

// setResponse switches the subscriber to a fixed status code.
func (s *stubSubscriber) setResponse(status int) {
	s.mu.Lock()
	s.status = status
	s.fn = nil
	s.mu.Unlock()
}

// setSequence switches the subscriber to a per-call status function.
func (s *stubSubscriber) setSequence(fn func(call int) int) {
	s.mu.Lock()
	s.fn = fn
	s.mu.Unlock()
}

func (s *stubSubscriber) hits() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.hitCount
}

// ---- harness accessors for DLQ state ----

func (h *harness) deadLetterCount() int {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	n, err := h.app.Deliveries().CountDeadLetter(ctx)
	if err != nil {
		return 0
	}
	return n
}

func (h *harness) deadLetterID() string {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	items, err := h.app.Deliveries().ListDeadLetter(ctx, 1, 0)
	if err != nil || len(items) == 0 {
		return ""
	}
	return items[0].ID
}

// assertDeliveryStatus checks the single delivery of a delivery-history
// response reached the wanted status (PRD state machine, §19).
func assertDeliveryStatus(t *testing.T, body map[string]any, want string) {
	t.Helper()
	deliveries, _ := body["deliveries"].([]any)
	if len(deliveries) != 1 {
		t.Fatalf("deliveries = %v, want 1 entry", deliveries)
	}
	first, _ := deliveries[0].(map[string]any)
	got, _ := first["status"].(string)
	if got != want {
		t.Errorf("delivery status = %q, want %q (body %v)", got, want, first)
	}
}
