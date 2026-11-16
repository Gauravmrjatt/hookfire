# Performance — methodology, benchmarks, load testing (PRD §35)

All numbers below come from real runs on this machine (Apple M2, 8 cores,
Go 1.22, Postgres 16 + Redis 7 in Docker). Nothing is fabricated; anything
not actually measured is labelled as such.

## 1. Micro-benchmarks (no services required)

Run:
```bash
go test -bench=. -benchmem -run=^$ ./tests/performance
```

Results (`go test -bench=. -benchmem`):

| Benchmark | ns/op | B/op | allocs/op | Hot path? |
|---|---|---|---|---|
| `BenchmarkSign` | **438.9** | 792 | 12 | yes — every delivery attempt |
| `BenchmarkEnvelopeMarshalAndSign` | **786.4** | 872 | 14 | yes — marshal-once + sign |
| `BenchmarkVerifySignature` | **470.7** | 873 | 13 | subscriber side |
| `BenchmarkRetryDelayCalculation` | **10.98** | 0 | 0 | yes — on failures (alloc-free) |
| `BenchmarkErrorEnvelope` | **346.3** | 688 | 8 | on errors |
| `BenchmarkJSON_OK` | **644.7** | 848 | 9 | on 2xx responses |
| `BenchmarkJWTAuth` | **2738** | 3216 | 62 | once per API request |

Take-aways:
- `Sign` (HMAC-SHA256) is cheap: ~440 ns per delivery → **~2.3 M
  signatures/sec on one core**. Crypto is not the bottleneck.
- `RetryDelayCalculation` is **alloc-free** — the retry hot path doesn't
  pressure the GC.
- `JWTAuth` dominates the API hot path at ~2.7 µs (JWT parse + map
  claims). Fine for an API, but note it runs on every `/v1` request.
- `BenchmarkEnvelopeMarshalAndSign` (786 ns) proves PRD §16: marshal once,
  sign the raw bytes, never re-marshal — the cost is paid once per attempt.

## 2. End-to-end load test (services required)

`cmd/loadtest` drives a real engine + subscriber. It now ships with a
built-in sink server so a single command gives end-to-end numbers.

```bash
# start dependencies (postgres + redis)
make docker-up

# start the engine in one terminal
JWT_SECRET=mine make run

# run the harness in another
JWT_SECRET=mine make token JWT_SECRET=mine SUB=demo EXP=1h   # prints token
go run ./cmd/loadtest -url http://localhost:8080 -token "$TOKEN" \
  -sink-port 9000 -events 10000 -endpoints 100 -concurrency 20 -drain-timeout 25m
```

`-sink-port` starts a local HTTP sink that returns `200`, so no separate
subscriber is needed; point real endpoints at your own receiver instead and
omit the flag.

What it measures:
- endpoint registration throughput
- ingest throughput (ev/s) + p50/p95/p99 latency (microsecond resolution)
- delivery throughput after the queue drains (via `/v1/stats`, waiting for
  terminal deliveries rather than just an empty queue)
- exact sink-side request count, so duplicate or missing deliveries show up
- final snapshot: queue depth, success rate, DLQ count
- `-dup-keys` / `-dup-copies`: concurrent idempotency test (see §3)

## 3. Target scenario (PRD §35) — measured

The PRD's target scenario is **10,000 events × 100 endpoints**, with the
worker count varied to show scaling. Both runs below are real, end-to-end
runs of the actual engine against Postgres 16 + Redis 7 in Docker on one
Apple M2 (8 cores), with the loadtest's built-in sink on `:9000` answering
`200` locally — no mock engine, no simulated numbers.

Shared scenario: 10,000 events, 100 registered endpoints → **1,000,000
deliveries**, ingest concurrency 20 (the pool is `MaxConns=20`), sink
latency ~0. Ingest and delivery overlap, as they do in production: the
drain timer starts when ingest finishes.

| Run | `WORKER_COUNT` | Ingest | Ingest p50 / p95 / p99 / max | Drain (1M deliveries) | Delivery throughput | Failures |
|---|---|---|---|---|---|---|
| A | 10 | 10,000 in **1m33s** (107 ev/s) | 185 / **291** / 387 / 560 ms | **8m04s** | **2,066 /s** | 0 |
| C | 40 | 10,000 in **1m29s** (113 ev/s) | 142 / **305** / 570 / 1,319 ms | **5m29s** | **3,041 /s** | 0 |

Both runs ended with the same terminal snapshot:

```json
{"queue_depth":0,"deliveries_total":1000000,"deliveries_successful":1000000,
 "deliveries_failed":0,"success_rate":1,"dead_letter_count":0}
```

Sink-side accounting matched exactly in both runs: `1,000,000/1,000,000`
requests received, `0` failed deliveries, `0` dead letters. The
`average_latency_ms` / `p99_latency_ms` fields in `/v1/stats` were broken
during these runs (they reported 0.0002 ms) and are **not** cited anywhere
here. Fixed afterwards: latencies are now recorded in microseconds instead of
being truncated to whole milliseconds, so a sub-millisecond subscriber response
no longer reads as zero. These numbers remain ingest-side only.

Non-default settings used (both runs):

```bash
WORKER_COUNT=10            # or 40 for run C
QUEUE_SIZE=2000            # 4000 for run C
DISPATCHER_INTERVAL=50ms   # default 1s: one claim tick per second
CLAIM_BATCH_SIZE=2000      # default 64
ALLOW_PRIVATE_URLS=true    # the sink is 127.0.0.1:9000
```

These overrides matter, and so does their history: the runs above were taken
before the dispatcher loop was fixed. With the old loop, stock
`DISPATCHER_INTERVAL=1s` and `CLAIM_BATCH_SIZE=64` capped the engine at 64
deliveries/s (~50× slower than the measured 3,041/s), because it slept a whole
tick between batches. The loop now keeps claiming while the store returns full
batches and only waits for the ticker when a claim comes back short, so that
ceiling is gone. **The numbers below were still measured with the tuned config
and have not been re-run against the new loop** - treat them as a floor, not a
default-config figure.

### What the two runs say

- **Scaling is sublinear.** 4× the workers bought **1.47×** the delivery
  throughput (2,066 → 3,041 /s) and cut drain time 32% (8m04s → 5m29s). Past
  ~10 workers this single-node setup is not worker-bound: it is bound by
  Postgres (claim + per-delivery `UPDATE` commits) and by the single local
  sink process, both of which share the same 8 cores.
- **Ingest is the honest bottleneck at ~110 ev/s**, essentially independent
  of worker count. Each ingest commits one event row plus 100 delivery rows
  in a single transaction; that's ~110 fsync'd commits/s. p95 stays ~300 ms
  and gets noisier at 40 workers (p99 570 ms) because delivery traffic is
  competing for the same connection pool and disk.
- **The rate limiter was not the limit here.** 100 endpoints × 100/s would
  cap delivery at 10,000/s; both runs stayed well below that, so the
  measured throughput is engine/DB-bound, not limiter-bound.
- **No duplicate deliveries were observed end to end**: the sink counted
  exactly 1,000,000 hits for 1,000,000 expected deliveries in both runs.

### Idempotent ingest under concurrency

Separate correctness run, 10 endpoints, 1,000 expected fan-out deliveries:

```
duplicate ingest: 200 keys x 20 concurrent copies in 1.380913208s
  responses: 200 created (201), 3800 replayed (200), 0 failed
  keys that created more than one event: 0
  fan-out checked on 200 events: 0 with >10 deliveries, 0 with <10, 0 unreadable
RESULT: PASS — one event per key, one delivery per endpoint, 0 duplicate deliveries
```

4,000 concurrent requests over 200 idempotency keys produced exactly 200
events, each fanned out to exactly one delivery per active endpoint. This is
**not** a proof of exactly-once delivery (impossible over HTTP); it is proof
that ingest is idempotent under contention.

### Reproducing

```bash
# 1. dependencies + migrations
make docker-up

# 2. engine (perf-tuned)
JWT_SECRET=perf-secret ALLOW_PRIVATE_URLS=true \
WORKER_COUNT=10 QUEUE_SIZE=2000 DISPATCHER_INTERVAL=50ms CLAIM_BATCH_SIZE=2000 \
  go run ./cmd/server

# 3. token + harness (sink included)
TOKEN=$(go run ./cmd/token -secret perf-secret -sub perf -exp 12h)
go run ./cmd/loadtest -url http://localhost:8080 -token "$TOKEN" \
  -sink-port 9000 -events 10000 -endpoints 100 -concurrency 20 -drain-timeout 25m

# 4. idempotency check
go run ./cmd/loadtest -url http://localhost:8080 -token "$TOKEN" \
  -sink-port 9000 -endpoints 10 -dup-keys 200 -dup-copies 20
```

Reset between runs so the numbers stay comparable:

```sql
TRUNCATE delivery_attempts, deliveries, events, endpoints, idempotency_keys RESTART IDENTITY CASCADE;
```
```bash
redis-cli FLUSHALL
```

## 4. What the numbers tell you

- **Ingest cost** is dominated by the DB transaction (one event row + N
  delivery rows in one commit) — measured at ~110 ev/s with 100 endpoints,
  and essentially unchanged from 10 to 40 workers. That's the honest
  bottleneck; the micro-benchmarks show the Go side is not it.
- **Delivery throughput** scales with `WORKER_COUNT` × outbound HTTP
  concurrency, but **sublinearly on a single node**: 2,066 → 3,041 /s for
  10 → 40 workers, because claim/commit work and the local sink share the
  same Postgres and CPU. The channel (`QUEUE_SIZE`) provides backpressure, and
  `FOR UPDATE SKIP LOCKED` lets additional engine instances add capacity
  linearly until Postgres commit rate caps out (Stage 2 in
  [scaling.md](scaling.md)). Adding engine *instances* is the next lever;
  adding goroutines to one process is not.
- **The dispatcher used to cap throughput at one batch per tick.** With the old
  loop, `DISPATCHER_INTERVAL=1s` and `CLAIM_BATCH_SIZE=64` held the engine to
  ~64 deliveries/s regardless of worker count, so a default-config benchmark
  measured the tick interval rather than the engine. Fixed: `dispatchOnce` now
  reports whether a claim came back full and the loop keeps claiming until it
  comes back short, falling through to the ticker only when the queue is full
  or the store is drained. Covered by
  `internal/worker/dispatch_test.go::TestDispatchLoopDrainsWithoutWaitingForTick`.
  Batch size now costs query round-trips rather than throughput.
- **Retry storms** are the real threat under load: the jitter fraction
  (`JITTER_FRACTION`) and the `MAX_RETRY_DELAY` cap exist to prevent
  10,000 endpoints failing at once from synchronizing on the same retry tick.
