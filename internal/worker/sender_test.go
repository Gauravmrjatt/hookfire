package worker

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"hookfire/internal/config"
	"hookfire/internal/model"
)

func testConfig(allowPrivate bool) config.Config {
	return config.Config{
		RequestTimeout:   2 * time.Second,
		MaxResponseBytes: 1024,
		AllowPrivateURLs: allowPrivate,
	}
}

func event() model.Event {
	return model.Event{
		ID:        "evt_test",
		EventType: "payment.completed",
		Payload:   []byte(`{"payment_id":"pay_123"}`),
	}
}

func TestSignMatchesHMACSpec(t *testing.T) {
	secret := "whsec_test"
	ts := "1730000000"
	body := []byte(`{"event_type":"payment.completed","payload":{"payment_id":"pay_123"}}`)

	got := Sign(secret, ts, body)

	// recomputed independently below via VerifySignature
	if !VerifySignature(secret, ts, body, "sha256="+got) {
		t.Fatal("VerifySignature failed for a signature produced by Sign")
	}
	if VerifySignature("other-secret", ts, body, "sha256="+got) {
		t.Fatal("signature must not verify with the wrong secret")
	}
	if VerifySignature(secret, ts, []byte(`{"tampered":true}`), "sha256="+got) {
		t.Fatal("signature must not verify with tampered body")
	}
	if len(got) != 64 {
		t.Errorf("hex sha256 length = %d, want 64", len(got))
	}
}

// HTTP delivery tests against httptest.Server (PRD §33): 200, 400, 500,
// timeout, connection failure.

func TestSendSuccess2xx(t *testing.T) {
	var gotSig, gotTS, gotBody string
	var gotID, gotDelivery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b := make([]byte, r.ContentLength)
		_, _ = r.Body.Read(b)
		gotBody = string(b)
		gotSig = r.Header.Get("X-Webhook-Signature")
		gotTS = r.Header.Get("X-Webhook-Timestamp")
		gotID = r.Header.Get("X-Webhook-ID")
		gotDelivery = r.Header.Get("X-Webhook-Delivery")
	}))
	defer srv.Close()

	s := NewSender(testConfig(true), discardLogger())
	res := s.Send(context.Background(),
		model.Endpoint{ID: "ep_1", URL: srv.URL, Secret: "whsec_x"}, event(), "dlv_1")

	if res.Err != nil || res.StatusCode != 200 {
		t.Fatalf("Send: status=%d err=%v", res.StatusCode, res.Err)
	}
	if gotID != "evt_test" || gotDelivery != "dlv_1" {
		t.Errorf("webhook headers: id=%q delivery=%q", gotID, gotDelivery)
	}
	if !VerifySignature("whsec_x", gotTS, []byte(gotBody), gotSig) {
		t.Error("signature does not verify over the transmitted raw body")
	}
	if !strings.Contains(gotBody, `"event_type":"payment.completed"`) {
		t.Errorf("body = %s, want canonical envelope", gotBody)
	}
}

func TestSendPermanentStatus(t *testing.T) {
	for _, code := range []int{400, 401, 404} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(code)
		}))
		s := NewSender(testConfig(true), discardLogger())
		res := s.Send(context.Background(),
			model.Endpoint{URL: srv.URL, Secret: "s"}, event(), "dlv_1")
		srv.Close()
		if res.Err == nil {
			t.Errorf("status %d: expected error", code)
		}
		if res.StatusCode != code {
			t.Errorf("status %d: got %d", code, res.StatusCode)
		}
	}
}

func TestSendHoveringRetryStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(503)
	}))
	defer srv.Close()
	s := NewSender(testConfig(true), discardLogger())
	res := s.Send(context.Background(), model.Endpoint{URL: srv.URL, Secret: "s"}, event(), "dlv_1")
	if res.StatusCode != 503 || res.Err == nil {
		t.Errorf("503: status=%d err=%v", res.StatusCode, res.Err)
	}
}

func TestSendConnectionFailure(t *testing.T) {
	s := NewSender(testConfig(true), discardLogger())
	res := s.Send(context.Background(),
		model.Endpoint{URL: "http://127.0.0.1:1/nothing", Secret: "s"}, event(), "dlv_1")
	if res.StatusCode != 0 || res.Err == nil {
		t.Errorf("connection failure: status=%d err=%v", res.StatusCode, res.Err)
	}
}

func TestSendTimeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(500 * time.Millisecond)
	}))
	defer srv.Close()

	cfg := testConfig(true)
	cfg.RequestTimeout = 50 * time.Millisecond
	s := NewSender(cfg, discardLogger())
	res := s.Send(context.Background(), model.Endpoint{URL: srv.URL, Secret: "s"}, event(), "dlv_1")
	if res.Err == nil {
		t.Fatal("expected timeout error")
	}
	if res.StatusCode != 0 {
		t.Errorf("timeout should have status 0, got %d", res.StatusCode)
	}
}

func TestSendResponseSizeCapped(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(make([]byte, 10000))
	}))
	defer srv.Close()

	s := NewSender(testConfig(true), discardLogger())
	res := s.Send(context.Background(), model.Endpoint{URL: srv.URL, Secret: "s"}, event(), "dlv_1")
	if res.Err == nil {
		t.Fatal("oversized response body should fail, not be delivered")
	}
}
