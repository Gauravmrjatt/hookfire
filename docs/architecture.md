# Architecture

## Request flow (PRD §43)

```
Client
  │  POST /v1/events  (Bearer JWT, Idempotency-Key)
  ▼
API (net/http ServeMux)
  │  middleware: recovery → logging → JWT auth → body limit
  ▼
EventService.Ingest               internal/service/event_service.go
  │  BEGIN
  │    INSERT event … ON CONFLICT (idempotency_key) DO NOTHING
  │    ├─ conflict → load existing event → COMMIT           → 200 OK
  │    └─ new     → INSERT delivery per active endpoint
  │  COMMIT
  ▼
nudge dispatcher (non-blocking)   internal/worker/worker.go
  │
Dispatcher (every 1s + nudges):
  │  UPDATE deliveries SET status='processing'
  │    WHERE id IN (SELECT … WHERE status IN ('pending','retrying')
  │      AND next_attempt_at <= now()
  │      ORDER BY next_attempt_at
  │      LIMIT $batch FOR UPDATE SKIP LOCKED)
  │  → joined rows (delivery + event + endpoint) → job channel
  ▼
Worker pool (WORKER_COUNT goroutines on a QUEUE_SIZE buffer):
  │  per-endpoint ordering slot (capability 1 by default)
  │  Redis token-bucket rate limit (per endpoint, cluster-wide)
  │  SSRF validation → signed request (HMAC-SHA256)
  │  record attempt row → classify status
  │    2xx          → status=delivered, delivered_at=now
  │    retryable    → status=retrying, next_attempt_at=now+backoff+jitter
  │    4xx / capped → status=dead_letter
  ▼
Subscriber (2xx done · 4xx/5xx per policy → retry → backoff → DLQ)
```

## Why this shape

| Decision | Why |
|---|---|
| PostgreSQL as the queue | Durability for free: an accepted event already has its fan-out plan inside one transaction. `FOR UPDATE SKIP LOCKED` gives a practical distributed work-queue without Kafka (PRD §26). |
| Durable retries | `status='retrying'` + `next_attempt_at` are persisted; the dispatcher is the only scheduler. Any instance crash loses nothing. |
| In-memory bounded channel | Protects the process from unbounded claim bursts; the DB remains the source of truth, so overflow is not data loss — just unclaimed rows picked up next tick. |
| Composition root in `internal/app` | `cmd/server` stays thin; integration tests assemble the same graph and run it behind `httptest`. |

## Reliability model

See [reliability.md](reliability.md) for the at-least-once argument, crash
recovery, duplicate-delivery windows, and the idempotency chain.

## Concurrency

- **Worker pool**: fixed N goroutines over a buffered channel (`WORKER_COUNT`, `QUEUE_SIZE`).
- **Dispatch**: single dispatcher goroutine per instance claiming in batches (`CLAIM_BATCH_SIZE`), competing with other instances via row locks.
- **Per-endpoint serialization**: each endpoint has a slot of capacity `ENDPOINT_CONCURRENCY` (default 1) — best-effort ordering (PRD §28), never claimed as strict.
- **Stale-processing recovery**: `ResetStaleProcessing` returns `processing` rows older than `STALE_PROCESSING_TIMEOUT` (evidence of a crashed worker) to `pending`.
- All request/worker paths thread `context.Context` for cancellation (PRD §47 rule 9).

## Partitioning (future; PRD §27)

Deliveries can be partitioned by `hash(endpoint_id) % N`:

- **Why by endpoint?** Delivery throughput is bounded per endpoint; partitioning by endpoint shards hot subscribers, groups retries, and gives per-partition sequencing.
- **Ordering**: a partition is a single consumer — per-endpoint FIFO becomes structural instead of per-endpoint slots.
- **Resizing**: changing N reshuffles endpoints across partitions; with Kafka that is a consumer-group rebalance (a delivery may be attempted twice during the handover — acceptable under at-least-once).
- **Kafka later**: topics per event type or one topic with endpoint-hash keys; consumer groups replace the claim query.
- **Consumer lag**: `sum(Kafka lag by partition)` / ingress rate = seconds of delivery lag; alert on lag, not CPU.
- **Worker failure**: partition ownership is reassigned by the group coordinator; uncommitted deliveries are redelivered.

Not implemented (PRD non-goals) — documented to show the migration path.
