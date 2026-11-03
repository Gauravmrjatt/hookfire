package worker

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"

	"hookfire/internal/config"
	"hookfire/internal/model"
)

// Sign computes the outbound webhook signature (PRD §16):
//
//	signing_input = timestamp + "." + raw_payload_bytes
//	signature    = hex(HMAC-SHA256(endpoint_secret, signing_input))
//
// The raw marshaled bytes are signed exactly once — they are never
// re-marshaled before transport.
func Sign(secret string, timestamp string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp))
	mac.Write([]byte("."))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// VerifySignature is the documented algorithm subscribers use to validate
// our requests; it is exported so tests and subscriber SDKs share it.
func VerifySignature(secret, timestamp string, body []byte, provided string) bool {
	expected := Sign(secret, timestamp, body)
	// constant-time comparison
	return hmac.Equal([]byte(expected), []byte(strings.TrimPrefix(provided, "sha256=")))
}

// SendResult is the outcome of one HTTP attempt.
type SendResult struct {
	StatusCode int    // 0 = transport-level failure before a response
	Body       []byte // caller-specified truncation applied
	Latency    time.Duration
	Err        error
	RetryAfter string // raw Retry-After header, if the subscriber sent one
}

// ErrSSRF marks a blocked destination URL.
var ErrSSRF = errors.New("destination blocked by SSRF protection")

// Sender performs outbound webhook HTTP requests with one long-lived,
// pooled http.Client (PRD §30 — never a client per request).
type Sender struct {
	client           *http.Client
	maxResponseBytes int64
	allowPrivate     bool
	logger           *slog.Logger
}

func NewSender(cfg config.Config, logger *slog.Logger) *Sender {
	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		MaxIdleConns:          200,
		MaxIdleConnsPerHost:   20,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   5 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		// conservative fallback dial timeout
		DialContext: (&net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
	}
	return &Sender{
		client: &http.Client{
			Transport: transport,
			// hard timeout for the whole request (PRD §30)
			Timeout: cfg.RequestTimeout,
		},
		maxResponseBytes: cfg.MaxResponseBytes,
		allowPrivate:     cfg.AllowPrivateURLs,
		logger:           logger,
	}
}

// ValidateDestination enforces the SSRF model (PRD §31): only http/https,
// and the resolved IPs must not be loopback, private, link-local
// (which covers cloud metadata endpoints like 169.254.169.254),
// unspecified, or multicast. When ALLOW_PRIVATE_URLS=true the check is
// skipped (local development and tests).
func (s *Sender) ValidateDestination(ctx context.Context, rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("scheme %q not allowed, use http or https", u.Scheme)
	}
	host := u.Hostname()
	if host == "" {
		return fmt.Errorf("URL has no host")
	}
	if s.allowPrivate {
		return nil
	}

	var ips []net.IPAddr
	if ip, err := netip.ParseAddr(host); err == nil {
		ips = []net.IPAddr{{IP: net.IP(ip.AsSlice())}}
	} else {
		ips, err = net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil {
			return fmt.Errorf("resolve host: %w", err)
		}
	}
	if len(ips) == 0 {
		return fmt.Errorf("host %q resolved to no addresses", host)
	}
	for _, ip := range ips {
		if isForbiddenIP(ip.IP) {
			return fmt.Errorf("%w: host %q resolves to forbidden address %s", ErrSSRF, host, ip.IP)
		}
	}
	return nil
}

func isForbiddenIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() {
		return true
	}
	// IPv4-mapped IPv6 addresses (::ffff:127.0.0.1 etc.) are caught by
	// net.IP.IsPrivate / IsLoopback only when unmapped, so inspect the 4-byte form.
	if v4 := ip.To4(); v4 != nil && !ip.Equal(v4) {
		return isForbiddenIP(v4)
	}
	return false
}

// build makes the signed request without sending it.
func (s *Sender) buildRequest(ctx context.Context, ep model.Endpoint, ev model.Event,
	deliveryID string, eventID string) (*http.Request, []byte, string, error) {

	// Marshal once; these exact bytes are both signed and sent (PRD §16).
	envelope := struct {
		ID        string          `json:"id"`
		EventType string          `json:"event_type"`
		Payload   json.RawMessage `json:"payload"`
	}{ID: ev.ID, EventType: ev.EventType, Payload: ev.Payload}
	body, err := json.Marshal(envelope)
	if err != nil {
		return nil, nil, "", fmt.Errorf("marshal event: %w", err)
	}

	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, ep.URL, bytes.NewReader(body))
	if err != nil {
		return nil, nil, "", fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Webhook-ID", eventID)
	req.Header.Set("X-Webhook-Delivery", deliveryID)
	req.Header.Set("X-Webhook-Timestamp", timestamp)
	req.Header.Set("X-Webhook-Signature", "sha256="+Sign(ep.Secret, timestamp, body))
	req.Header.Set("User-Agent", "hookfire/1.0")
	return req, body, timestamp, nil
}

// Send performs one signed delivery attempt against the endpoint.
func (s *Sender) Send(ctx context.Context, ep model.Endpoint, ev model.Event, deliveryID string) SendResult {
	start := time.Now()

	if err := s.ValidateDestination(ctx, ep.URL); err != nil {
		// SSRF blocks are permanent: the URL itself is the problem.
		return SendResult{Err: fmt.Errorf("validate destination: %w", err), Latency: time.Since(start)}
	}

	req, _, _, err := s.buildRequest(ctx, ep, ev, deliveryID, ev.ID)
	if err != nil {
		return SendResult{Err: err, Latency: time.Since(start)}
	}

	resp, err := s.client.Do(req)
	latency := time.Since(start)
	if err != nil {
		return SendResult{Err: err, Latency: latency}
	}
	defer func() {
		// drain + close so the pooled connection can be reused
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
	}()

	// read up to cap+1 so an oversized response is detectable (PRD §31)
	body, _ := io.ReadAll(io.LimitReader(resp.Body, s.maxResponseBytes+1))
	if s.maxResponseBytes > 0 && int64(len(body)) > s.maxResponseBytes {
		return SendResult{
			StatusCode: resp.StatusCode,
			Latency:    time.Since(start),
			Err:        fmt.Errorf("response body exceeds %d bytes", s.maxResponseBytes),
		}
	}
	res := SendResult{
		StatusCode: resp.StatusCode,
		Body:       body,
		Latency:    time.Since(start),
		RetryAfter: resp.Header.Get("Retry-After"),
	}

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		res.Err = fmt.Errorf("subscriber returned status %d", resp.StatusCode)
		if ra := resp.Header.Get("Retry-After"); ra != "" {
			res.Err = fmt.Errorf("%w (Retry-After: %s)", res.Err, ra)
		}
	}
	return res
}
