# Reliability Model

The core guarantee (PRD §2): **at-least-once delivery** with durable storage,
retries, dead-lettering, replay, and idempotent ingestion. Exactly-once is
explicitly not attempted (PRD non-goals §3).

## 1. Durability before acceptance

An event is "accepted" only after `COMMIT` succeeds:

```
BEGIN
  INSERT event                (UNIQUE idempotency_key)
  INSERT delivery × endpoints (status = pending, next_attempt_at = now)
COMMIT
```

- Postgres down → 503 to the caller, never a false 201 (PRD §29).
- Delivery plan written in the same transaction as the event: an accepted
  event can never "lose" its fan-out.

## 2. At-least-once, not exactly-once

The window that produces duplicates:

```
Worker → subscriber receives webhook (2xx) → worker crashes before DB update
```

On recovery the delivery is still `processing`, later reset to `pending`, and
delivered again → **duplicate**. This is inherent to at-least-once; it is why
subscribers must be idempotent (use `X-Webhook-ID` + `X-Webhook-Delivery` as
dedupe keys) and why signing includes the timestamp (replay protection at the
subscriber).

Other guarantee boundaries:
- Postgres commit ≠ subscriber success: it is the *start* of the delivery pipeline, not its end.
- Exactly-once over arbitrary HTTP endpoints is impossible (no atomic "ack + mark" across failure domains).

## 3. Retry policy (PRD §18)

- Exponential backoff: `delay = min(initial × multiplier^attempt, max)` with ±25% configurable jitter to prevent synchronized retry storms.
- Default ladder: 5s → 10s → 20s → … → 15m cap; `MAX_RETRIES=7`.
- Classification is configurable (PRD §17): `RETRYABLE_STATUS_CODES=408,429,500,502,503,504` (+ other 5xx, + transport errors/timeouts); permanent: `400,401,403,404,410` → straight to DLQ.
- `Retry-After` on 429/503 is honored (seconds or HTTP date), clamped to max.
- Retry schedules are persisted (`status=retrying`, `next_attempt_at`) — not in-memory timers — so retries survive any crash.

## 4. Crash recovery (PRD §29)

| Crash point | Outcome |
|---|---|
| After commit, before claim | Delivery row stays `pending` → next dispatch tick claims it. |
| Mid-attempt (`processing`) | `ResetStaleProcessing` (every `STALE_PROCESSING_TIMEOUT/2`) returns rows older than the threshold to `pending` → re-attempted (may duplicate — §2). |
| Between claim and channel send | Row is `processing`; same recovery path. |
| HTTP sent, DB update lost | Same recovery path → duplicate (§2). |
| Whole instance lost | Other instances claim freely: `FOR UPDATE SKIP LOCKED` skips nothing destructive; stranded rows are recovered by any survivor or on restart. |
| Listener loss (nudge channel) | Dispatcher polls every `DISPATCHER_INTERVAL` regardless; nudges are an optimization. |

## 5. Idempotency chain (PRD §13)

Caller-supplied `Idempotency-Key`:

1. `events.idempotency_key` is `UNIQUE` — the database is the arbiter, not application "if exists" checks.
2. Insert uses `ON CONFLICT (idempotency_key) DO NOTHING`; a losing writer reads the winner's event in the same transaction and replays it with 200.
3. Concurrent-safe: two racing inserts (same pod or different pods) cannot both win. Verified by the 100-goroutine integration test.

## 6. Terminal failures (PRD §20)

After MAX_RETRIES exhausted or a permanent 4xx: `status=dead_letter`,
listed by `GET /v1/deliveries/dead-letter`, resumable via `POST
/v1/deliveries/{id}/replay` (`dead_letter → pending`, attempt counter reset
to 0 for the *replay cycle*, original event preserved).

## 7. Rate limiting degradation (PRD §23)

Redis unavailable during delivery:
- `RATE_LIMIT_FAIL_OPEN=true` (default): deliver anyway (availability first, note in logs).
- `=false`: hold the delivery (`retrying`, +1s) until Redis returns (protection first) — deliveries are never lost either way.

## 8. Ordering (PRD §28)

Best-effort per endpoint: the claim query orders by `next_attempt_at, created_at`,
and each endpoint is serialized by a per-endpoint slot
(`ENDPOINT_CONCURRENCY=1`). Not strict ordering: crashes/rate-limits can
release later events first. Never claim global ordering across endpoints.

## 9. Security posture (PRD §31)

- JWT (HS256, mandatory `exp`) on every `/v1` route.
- HMAC-SHA256 signatures on outbound webhooks; `timestamp + "." + raw_body`.
- SSRF protection: schemes limited to http/https; resolved IPs checked against loopback/private/link-local/multicast (covers `169.254.169.254` cloud metadata); `ALLOW_PRIVATE_URLS=true` only for local dev/tests.
- Body limits inbound (1 MiB) and on subscriber responses (64 KiB cap).
- Parameterized SQL everywhere; secrets via env only; logs never contain JWTs, secrets, or payloads.
