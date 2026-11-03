package integration

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"
)

// TestIngestAndDeliver covers the core happy path (PRD §48 demo, steps 1–8):
// create endpoint -> ingest event -> worker delivers -> status becomes delivered.
func TestIngestAndDeliver(t *testing.T) {
	h := newHarness(t, false)

	var hits int
	subs := subscriber(t, &hits, 200)

	// Create endpoint (PRD phase 2)
	status, body := h.do("POST", "/v1/endpoints", `{"name":"sub","url":"`+subs.URL()+`"}`, nil)
	if status != 201 {
		t.Fatalf("create endpoint: %d %v", status, body)
	}
	endpointID, _ := body["id"].(string)
	if endpointID == "" {
		t.Fatalf("endpoint id missing: %v", body)
	}

	// Secret must never appear in API responses (PRD §32)
	raw, _ := json.Marshal(body)
	if got := string(raw); strings.Contains(got, "secret") {
		t.Errorf("endpoint response leaks secret: %s", got)
	}

	// Ingest event (PRD phase 3)
	status, body = h.do("POST", "/v1/events",
		`{"event_type":"payment.completed","payload":{"payment_id":"123"}}`,
		map[string]string{"Idempotency-Key": "test-key-1"})
	if status != 201 {
		t.Fatalf("ingest event: %d %v", status, body)
	}
	eventID, _ := body["id"].(string)
	if eventID == "" {
		t.Fatalf("event id missing: %v", body)
	}

	waitFor(t, 5_000_000_000, func() bool { return hits == 1 }, "subscriber to receive webhook")
	status, body = h.do("GET", "/v1/events/"+eventID+"/deliveries", "", nil)
	if status != 200 {
		t.Fatalf("delivery history: %d", status)
	}
	assertDeliveryStatus(t, body, "delivered")
}

// TestIdempotencyUniqueConstraint is the concurrency test from PRD §34:
// 100 concurrent requests with the same Idempotency-Key must produce
// exactly one event and 99 identical (200) responses.
func TestIdempotencyUniqueConstraint(t *testing.T) {
	h := newHarness(t, false)

	h.do("POST", "/v1/endpoints", `{"name":"sub","url":"http://127.0.0.1:1/x"}`, nil)

	const n = 100
	results := make([]int, n)
	ids := make([]string, n)
	var wg sync.WaitGroup
	var mu sync.Mutex

	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			status, body := h.do("POST", "/v1/events",
				`{"event_type":"x.y","payload":{}}`,
				map[string]string{"Idempotency-Key": "same-key-everyone"})
			mu.Lock()
			results[i] = status
			ids[i], _ = body["id"].(string)
			mu.Unlock()
		}(i)
	}
	wg.Wait()

	created, replayed := 0, 0
	distinct := map[string]bool{}
	for i, status := range results {
		if status == 201 {
			created++
		} else if status == 200 {
			replayed++
		} else {
			t.Fatalf("unexpected status %d at %d", status, i)
		}
		if ids[i] != "" {
			distinct[ids[i]] = true
		}
	}
	if created != 1 {
		t.Errorf("created = %d, want exactly 1", created)
	}
	if replayed != n-1 {
		t.Errorf("replayed = %d, want %d", replayed, n-1)
	}
	if len(distinct) != 1 {
		t.Errorf("distinct event ids = %d, want 1", len(distinct))
	}
}

// TestRetryThenDelivered covers subscriber 500 -> retry -> delivered.
func TestRetryThenDelivered(t *testing.T) {
	h := newHarness(t, false)

	var hits int
	sub := subscriber(t, &hits, 0)
	sub.setSequence(func(call int) int {
		if call == 1 {
			return 500
		}
		return 200
	})

	h.do("POST", "/v1/endpoints", `{"name":"sub","url":"`+sub.URL()+`"}`, nil)
	h.do("POST", "/v1/events", `{"event_type":"x.y","payload":{}}`,
		map[string]string{"Idempotency-Key": "retry-key"})

	waitFor(t, 10_000_000_000, func() bool { return hits == 1 }, "delivery to succeed after retry")
}

// TestPermanentFailureDLQReplay covers: subscriber 400 -> immediate DLQ ->
// replay -> subscriber recovered -> delivered (PRD §20/§48 steps 9–18).
func TestPermanentFailureDLQReplay(t *testing.T) {
	h := newHarness(t, false)

	var hits int
	sub := subscriber(t, &hits, 400)

	h.do("POST", "/v1/endpoints", `{"name":"sub","url":"`+sub.URL()+`"}`, nil)
	_, body := h.do("POST", "/v1/events", `{"event_type":"x.y","payload":{}}`,
		map[string]string{"Idempotency-Key": "dlq-key"})
	eventID, _ := body["id"].(string)

	// 400 is permanent -> straight to DLQ without retries
	waitFor(t, 5_000_000_000, func() bool {
		return h.deadLetterCount() == 1
	}, "delivery to reach the DLQ after a 400")

	// subscriber recovers
	sub.setResponse(200)

	// replay
	status, body := h.do("POST", "/v1/deliveries/"+h.deadLetterID()+"/replay", "", nil)
	if status != 202 {
		t.Fatalf("replay: %d %v", status, body)
	}
	waitFor(t, 5_000_000_000, func() bool { return hits == 1 }, "replayed delivery to succeed")

	_, deliveries := h.do("GET", "/v1/events/"+eventID+"/deliveries", "", nil)
	assertDeliveryStatus(t, deliveries, "delivered")
}

// TestRetriesToDLQ covers 500 until MAX_RETRIES exhaustion -> dead_letter.
func TestRetriesToDLQ(t *testing.T) {
	h := newHarness(t, false)

	var hits int
	sub := subscriber(t, &hits, 500)

	h.do("POST", "/v1/endpoints", `{"name":"sub","url":"`+sub.URL()+`"}`, nil)
	h.do("POST", "/v1/events", `{"event_type":"x.y","payload":{}}`,
		map[string]string{"Idempotency-Key": "exhaust-key"})

	// MaxRetries=3 => attempts 1(+3 retries)=4 total, then DLQ
	waitFor(t, 15_000_000_000, func() bool {
		return h.deadLetterCount() == 1
	}, "delivery to exhaust retries and dead-letter")
}

// TestRateLimitHoldsDelivery exercises the Redis token bucket (PRD §23).
func TestRateLimitHoldsDelivery(t *testing.T) {
	h := newHarness(t, true)

	var hits int
	sub := subscriber(t, &hits, 200)

	status, body := h.do("POST", "/v1/endpoints",
		`{"name":"sub","url":"`+sub.URL()+`","rate_limit":1}`, nil)
	if status != 201 {
		t.Fatalf("create endpoint: %d %v", status, body)
	}

	// Burst of 20 events to an endpoint with rate_limit=1/s: the attempt
	// counts must stay bounded by the limiter even though workers are free.
	const n = 20
	for i := 0; i < n; i++ {
		key := fmt.Sprintf("rl-key-%d", i)
		st, b := h.do("POST", "/v1/events", `{"event_type":"x.y","payload":{}}`,
			map[string]string{"Idempotency-Key": key})
		if st != 201 {
			t.Fatalf("ingest %d: %d %v", i, st, b)
		}
	}

	// rate=1/s with capacity (rate*burstFactor=1): deliveries must trickle.
	time.Sleep(3 * time.Second)
	if hits > 4 {
		t.Errorf("rate limiter failed: %d deliveries completed within ~3s (limit 1/s)", hits)
	}
	// everything still eventually delivers; nothing dead-lettered
	if h.deadLetterCount() != 0 {
		t.Errorf("rate-limited deliveries died: %d", h.deadLetterCount())
	}
}
