// Package performance holds micro-benchmarks of hot paths (PRD §35).
// No services required — run anywhere:
//
//	go test -bench=. -benchmem ./tests/performance
//
// Results are recorded honestly in docs/performance.md; never fabricate.
package performance

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"hookfire/internal/middleware"
	"hookfire/internal/model"
	"hookfire/internal/worker"
	"hookfire/pkg/response"
)

// payload mimics one event envelope (PRD §15 body shape).
const payload = `{"id":"evt_1a2b3c","event_type":"payment.completed","payload":{"payment_id":"pay_123","amount":50000}}`

// BenchmarkSign is the per-delivery crypto cost (HMAC-SHA256 over
// timestamp + "." + body) — runs once per webhook attempt.
func BenchmarkSign(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		worker.Sign("whsec_2AVf4c5dHe8",
			strconv.FormatInt(int64(i), 10), []byte(payload))
	}
}

// BenchmarkEnvelopeMarshalAndSign measures the full outbound hot path:
// marshal the event envelope once + HMAC sign the raw bytes (PRD §16).
func BenchmarkEnvelopeMarshalAndSign(b *testing.B) {
	ev := model.Event{
		ID:        "evt_1a2b3c",
		EventType: "payment.completed",
		Payload:   json.RawMessage(`{"payment_id":"pay_123","amount":50000}`),
	}
	envelope := struct {
		ID        string          `json:"id"`
		EventType string          `json:"event_type"`
		Payload   json.RawMessage `json:"payload"`
	}{}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		envelope.ID = ev.ID
		envelope.EventType = ev.EventType
		envelope.Payload = ev.Payload
		body, _ := json.Marshal(envelope)
		worker.Sign("whsec_2AVf4c5dHe8",
			strconv.FormatInt(time.Now().Unix(), 10), body)
	}
}

// BenchmarkVerifySignature covers the subscriber-side constant-time check.
func BenchmarkVerifySignature(b *testing.B) {
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	sig := worker.Sign("whsec_2AVf4c5dHe8", ts, []byte(payload))
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if !worker.VerifySignature("whsec_2AVf4c5dHe8", ts, []byte(payload), "sha256="+sig) {
			b.Fatal("verify failed")
		}
	}
}

// BenchmarkRetryDelayCalculation runs on every failed attempt.
func BenchmarkRetryDelayCalculation(b *testing.B) {
	p := worker.NewRetryPolicy(7, 5*time.Second, 15*time.Minute, 2.0,
		0.25, []int{408, 429, 500, 502, 503, 504}, []int{400, 401, 403, 404, 410}, 42)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		p.NextDelay(i % 8)
	}
}

// BenchmarkErrorEnvelope measures the unified error writer (PRD §41).
func BenchmarkErrorEnvelope(b *testing.B) {
	benchWrite(b, http.StatusBadRequest, func(w http.ResponseWriter) {
		response.Error(w, http.StatusBadRequest, response.CodeInvalidRequest, "event_type is required")
	})
}

// BenchmarkJSON_OK measures a typical 2xx JSON write.
func BenchmarkJSON_OK(b *testing.B) {
	ev := model.Event{
		ID: "evt_ok", EventType: "payment.completed",
		Payload: json.RawMessage(`{"payment_id":"pay_123"}`),
	}
	benchWrite(b, http.StatusOK, func(w http.ResponseWriter) {
		response.JSON(w, http.StatusOK, ev)
	})
}

func benchWrite(b *testing.B, status int, write func(http.ResponseWriter)) {
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		w := httptest.NewRecorder()
		w.WriteHeader(status)
		write(w)
	}
}

// BenchmarkJWTAuth verifies HS256 + claim parsing — the auth hot path.
func BenchmarkJWTAuth(b *testing.B) {
	token, err := middleware.IssueToken("bench-secret", "bench", time.Hour)
	if err != nil {
		b.Skipf("issue token: %v", err)
	}
	auth := middleware.NewJWTAuth("bench-secret")
	protected := auth.Wrap(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	req, _ := http.NewRequest(http.MethodPost, "/v1/events", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		protected.ServeHTTP(httptest.NewRecorder(), req)
	}
}
