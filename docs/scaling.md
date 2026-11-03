# Scaling Guide (PRD §44)

A staged progression from single instance to distributed infrastructure, with
the tradeoffs at every step.

## Stage 1 — One instance
```
[ go engine ] ── [ postgres ] ── [ redis ]
```
- Scale: 10 workers claim rows with `SKIP LOCKED`; single Postgres writer.
- Bottleneck: Postgres write/sync throughput; outbound HTTP fan-out.
- Tradeoff: simplest; no coordination cost; vertical ceiling.

## Stage 2 — Multiple instances behind a load balancer
```
              [ LB ]
        /       |       \
   [engine] [engine] [engine]
        \       |       /
          [postgres, redis]
```
- API is stateless → SSL termination + LB suffices.
- Workers compete with `UPDATE … FOR UPDATE SKIP LOCKED` — no double
  processing; throughput still capped by Postgres commit rate (the claim
  UPDATE is one statement per batch, not per delivery).
- Tradeoff: DB becomes the shared floor; mitigate with bigger claims, more
  connections, read replicas for history endpoints.

## Stage 3 — Partitioned workers
Partition deliveries by `hash(endpoint_id) % N` (PRD §27): each partition =
one consumer → structural per-endpoint ordering, endpoint-bound retries stay
together. Tradeoff: a hot endpoint pins its partition; rebalancing on N change
requires handover (duplicates during transition are acceptable at-least-once).
With Postgres this can be approximated per-instance via claim filters; the
clean realization is (Stage 4).

## Stage 4 — Kafka (future; explicitly not implemented, PRD non-goals §3)
- Ingest → `events` topic; delivery planners write `deliveries` records keyed
  by `hash(endpoint_id)` → per-endpoint ordering becomes Kafka partition
  ordering.
- Consumer groups replace the claim loop; retries become delayed topics or
  remain Postgres-scheduled while Kafka carries first-pass fan-out.
- Consumer lag = delivery backlog: monitor `records-lag-max` per partition
  and time-based lag (lag / ingress rate) rather than CPU.
- Tradeoffs: new failure modes (compaction, rebalance storms), ops burden.

## Stage 5 — Kubernetes autoscaling
- Ship manifest included: HPA v2 on CPU (Stage 5 of the manifest, PRD §38).
- **Queue-depth-driven scaling is the meaningful signal**: with the
  Prometheus-adapter, scale on:
  - `webhook_queue_depth` (here: in-memory; better: `count(deliveries WHERE
    status IN ('pending','retrying'))` exported as an ExternalMetric), and
  - delivery lag: `oldest pending next_attempt_at` age.
- Scale-down must be stabilized (min 5 min window) and workers must finish
  graceful shutdown before pod death (`terminationGracePeriodSeconds` >
  `STALE_PROCESSING_TIMEOUT` assumption is safe).

## Load testing (PRD §35)

`cmd/loadtest` drives N events against M endpoints with configurable
concurrency and reports ingest throughput, latency percentiles, and the
`/v1/stats` snapshot after delivery. Run it and record results honestly:

```bash
make token JWT_SECRET=mine EXP=1h TOKEN=…   # or: go run ./cmd/token
go run ./cmd/loadtest -url http://localhost:8080 -token $TOKEN \
  -target http://subscriber:9000/hook -events 10000 -endpoints 100
```

**Result placeholders (not measured on this machine — TODO):**
> Scenario: 10,000 events × 100 endpoints × 10 workers.
> Throughput: not measured · Latency: not measured · Success rate: not
> measured · DB load: not measured.
> Fill these in from a real `docker compose up` + `loadtest` run; do not
> fabricate numbers (PRD §47 rule 14).
