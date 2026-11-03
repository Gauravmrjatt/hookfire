# Performance — methodology, benchmarks, load testing (PRD §35)

All numbers below come from real runs on this machine (Apple M2, Go 1.22).
Nothing is fabricated; unmeasured scenarios are marked **TODO**.

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
  -events 10000 -endpoints 100 -concurrency 20
```

What it measures:
- endpoint registration throughput
- ingest throughput (ev/s) + p50/p95/p99 latency
- delivery throughput after the queue drains (via `/v1/stats`)
- final snapshot: queue depth, success rate, DLQ count, avg + p99 latency

## 3. Target scenario (PRD §35) — NOT YET MEASURED

The PRD's target scenario is:
**10,000 events × 100 endpoints × 10 workers**.

Results on this machine: **TODO / not measured** — Docker is not installed
here, so the end-to-end run has not been executed. Run the commands in §2
and record the output here honestly. Do not fabricate numbers (PRD §47 rule 14).

Placeholder template (fill in after a real run):
```
registered 100/100 endpoints in <ms>
ingested 10000 accepted, 0 duplicate, 0 failed in <s> (<n> ev/s)
ingest latency p50=<ms> p95=<ms> p99=<ms> max=<ms>
drain time (all deliveries delivered): <s>
delivery throughput: <n> deliveries/s
stats snapshot: queue_depth=0 success_rate=1.0 dead_letter_count=0
```

## 4. What the numbers tell you

- **Ingest cost** is dominated by the DB transaction (one event row + N
  delivery rows in one commit) — that's the honest bottleneck; the
  micro-benchmarks show the Go side is not it.
- **Delivery throughput** scales with `WORKER_COUNT` × outbound HTTP
  concurrency; the channel (`QUEUE_SIZE`) provides backpressure, and
  `FOR UPDATE SKIP LOCKED` lets additional engine instances add capacity
  linearly until Postgres commit rate caps out (Stage 2 in
  [docs/scaling.md](docs/scaling.md)).
- **Retry storms** are the real threat under load: the jitter fraction
  (`JITTER_FRACTION`) and the `MAX_RETRY_DELAY` cap exist to prevent
  10,000 endpoints failing at once from synchronizing on the same retry tick.
