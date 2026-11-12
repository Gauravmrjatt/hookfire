# API Reference

Base URL: `http://localhost:8080`. All `/v1` endpoints require
`Authorization: Bearer <JWT>` — mint tokens with `make token JWT_SECRET=...`
(PRD §22). Public endpoints: `/health`, `/ready`, `/metrics`.

Errors use the uniform envelope (PRD §41):

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "event_type is required"
  }
}
```

Status mapping: 400 invalid input · 401 missing/invalid JWT ·
404 unknown resource · 409 conflicting state ·
500 internal · 503 postgres/redis unavailable.

---

## CORS

The dashboard is a browser client, so the API answers CORS preflights for an
explicit allowlist:

```bash
CORS_ALLOWED_ORIGINS=http://localhost:5173,https://ops.example.com
```

Defaults cover the Vite dev server (`http://localhost:5173`,
`http://127.0.0.1:5173`). `*` is accepted for throwaway local setups and must
never be used in production. Production deployments should serve the dashboard
and `/v1` from one origin behind a reverse proxy, which removes CORS entirely.

---

## Health / Ops

### `GET /health` (public)
Liveness. `{"status":"ok"}`.

### `GET /ready` (public)
Readiness: PostgreSQL (always) and Redis (when configured) must respond; otherwise 503.

### `GET /metrics` (public)
Prometheus exposition. Instrument: `webhook_events_total`,
`webhook_deliveries_total{status}`, `webhook_delivery_failures_total{endpoint_id}`,
`webhook_delivery_retries_total{endpoint_id}`, `webhook_delivery_latency_seconds{endpoint_id}`,
`webhook_queue_depth`, `webhook_dead_letter_total`, `webhook_active_workers`.
No event IDs, URLs, or payloads in labels (PRD §24).

### `GET /v1/stats`
```json
{
  "queue_depth": 23, "active_workers": 8,
  "deliveries_total": 12450, "deliveries_successful": 11920,
  "deliveries_failed": 530, "success_rate": 0.9574,
  "dead_letter_count": 42, "average_latency_ms": 182, "p99_latency_ms": 940
}
```

---

## Endpoints (subscribers)

### `POST /v1/endpoints`
```bash
curl -X POST http://localhost:8080/v1/endpoints \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"payment-service","url":"https://example.com/webhooks","rate_limit":100}'
```
201 → the endpoint object with the `secret` field at the top level:

```json
{ "id": "ep_…", "name": "payment-service", "url": "https://example.com/webhooks",
  "active": true, "rate_limit": 100, "created_at": "…", "updated_at": "…",
  "secret": "whsec_…" }
```

The secret is returned **only here** (or echoed when caller-supplied) and is
never serialized by `GET` responses; it is required to verify signatures on
your subscriber. Errors: 400 missing/invalid name or URL (http/https only).

### `GET /v1/endpoints`
200 → array of endpoints. The `secret` field is omitted entirely.

### `GET /v1/endpoints/{id}`
200 or 404.

### `DELETE /v1/endpoints/{id}`
204. Soft delete: stops fan-out; history and FKs preserved.

---

## Events

### `POST /v1/events`
Headers: `Authorization`, `Idempotency-Key` (required, ≤256 chars), `Content-Type: application/json`. Body ≤1 MiB.

```bash
curl -X POST http://localhost:8080/v1/events \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: payment-123-completed" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"payment.completed","payload":{"payment_id":"123","amount":500}}'
```
- 201 Created — event persisted, deliveries fanned out.
- 200 OK — same `Idempotency-Key` seen before; returns the original event (no duplicate).
- 400 invalid `event_type`/payload JSON/too long.
- 503 database unavailable (event is never "accepted" without persistence — PRD §29).

### `GET /v1/events/{id}`
200 or 404 → `{ "id": "evt_…", "event_type": "…", "payload": {…}, "created_at": "…" }`.

### `GET /v1/events?limit=25&offset=0&q=payment&event_type=payment.completed`
Paginated feed for the dashboard, newest first. Each item is the event plus
fan-out counters, so the UI needs no N+1 calls:

```json
{ "items": [ { "id": "evt_…", "event_type": "payment.completed", "payload": {…},
  "created_at": "…", "deliveries": 3, "delivered": 2, "in_flight": 1, "dead_letter": 0 } ],
  "total": 128, "limit": 25, "offset": 0 }
```

`q` matches event id or event type (case-insensitive substring). `limit` is
capped at 200; `offset` is 0-based.

### `GET /v1/events/{id}/deliveries`
Delivery history for one event:
```json
{ "event": {…}, "deliveries": [ { "id": "dlv_…", "endpoint_id": "ep_…", "status": "delivered", "attempt_count": 2, "delivered_at": "…" } ] }
```

---

## Deliveries

### `GET /v1/deliveries?limit=25&offset=0&status=pending,retrying&endpoint_id=ep_…&q=payment`
Paginated delivery explorer, newest first. Rows join the event type and the
endpoint label (name + URL) so the dashboard renders a table in one request:

```json
{ "items": [ { "id": "dlv_…", "event_id": "evt_…", "endpoint_id": "ep_…",
  "status": "retrying", "attempt_count": 2, "next_attempt_at": "…",
  "created_at": "…", "event_type": "payment.completed",
  "endpoint_name": "payment-service", "endpoint_url": "https://…" } ],
  "total": 902, "limit": 25, "offset": 0 }
```

`status` is a comma-separated list validated against the delivery state
machine. `q` matches delivery id or event type. `limit` is capped at 200.

### `GET /v1/deliveries/dead-letter?limit=50&offset=0`
The dead-letter queue, newest first (PRD §20).

### `GET /v1/deliveries/{id}`
Delivery + its attempt log (every HTTP attempt with status code, latency, error).

### `POST /v1/deliveries/{id}/replay`
Replays a dead-lettered delivery: `dead_letter → pending → delivered…`.
Preserves the original event id; creates no new event. 202 Accepted,
409/400 if the delivery is not in the DLQ.

---

## Subscriber verification guide (PRD §16)

For every webhook you receive:

```go
signingInput := timestamp + "." + rawBody            // both from the request
expected := hex(HMAC_SHA256(endpointSecret, signingInput))
if subtle.ConstantTimeCompare(expected, provided[7:]) != 1 { reject }  // strip "sha256=" prefix
```

- `X-Webhook-Timestamp` — unix seconds; reject stale timestamps (>5 min) to block replays.
- `X-Webhook-Signature` — `sha256=<hex>`; compare constant-time.
- Body bytes must be read raw — do not re-marshal JSON before verifying.
- Respond 2xx quickly; 2xx means "processed, will not be retried".
- Return `429` with `Retry-After` and we will honor it.
