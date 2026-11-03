package worker

import (
	"context"
	"log/slog"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"hookfire/internal/config"
	"hookfire/internal/metrics"
	"hookfire/internal/model"
	"hookfire/internal/ratelimit"
)

// DeliveryStore is the slice of repository.Deliveries the worker needs.
type DeliveryStore interface {
	ClaimDue(ctx context.Context, limit int) ([]model.DeliveryWithEvent, error)
	ResetStaleProcessing(ctx context.Context, olderThan time.Duration) ([]string, error)
	MarkDelivered(ctx context.Context, id string, attemptCount int) error
	ScheduleRetry(ctx context.Context, id string, attemptCount int, next time.Time, lastErr string) error
	MarkDeadLetter(ctx context.Context, id string, attemptCount int, lastErr string) error
}

// AttemptStore records every HTTP attempt.
type AttemptStore interface {
	Insert(ctx context.Context, a model.DeliveryAttempt) error
}

// Pool is the delivery engine: a dispatcher goroutine that claims due
// deliveries from PostgreSQL, a bounded job channel, and N worker goroutines
// (PRD §14). Retries are NOT in-memory timers: workers persist
// status='retrying' + next_attempt_at, and the dispatcher picks them up when
// due — so retry schedules survive crashes of any instance.
type Pool struct {
	cfg      config.Config
	log      *slog.Logger
	store    DeliveryStore
	attempts AttemptStore
	sender   *Sender
	policy   *RetryPolicy
	limiter  *ratelimit.Limiter
	metrics  *metrics.Metrics
	stats    StatsSink

	jobs   chan model.DeliveryWithEvent
	nudge  chan struct{}
	closed chan struct{}

	inFlight atomic.Int64 // currently processing workers (for /v1/stats)

	// endpointSlots serializes deliveries per endpoint to give clients
	// best-effort per-endpoint ordering (PRD §28). Capacity = config.
	slotMu sync.Mutex
	slots  map[string]chan struct{}
	wg     sync.WaitGroup
}

// StatsSink lets the pool publish runtime stats (queue depth, workers) into
// /v1/stats, plus per-delivery counters.
type StatsSink interface {
	SetQueueDepth(n int)
	SetActiveWorkers(n int64)
	Delivered(latency time.Duration)
	DeadLettered()
}

func NewPool(cfg config.Config, log *slog.Logger, store DeliveryStore, attempts AttemptStore,
	sender *Sender, policy *RetryPolicy, limiter *ratelimit.Limiter, m *metrics.Metrics, stats StatsSink) *Pool {
	p := &Pool{
		cfg:      cfg,
		log:      log,
		store:    store,
		attempts: attempts,
		sender:   sender,
		policy:   policy,
		limiter:  limiter,
		metrics:  m,
		stats:    stats,
		jobs:     make(chan model.DeliveryWithEvent, cfg.QueueSize),
		nudge:    make(chan struct{}, 1),
		closed:   make(chan struct{}),
		slots:    map[string]chan struct{}{},
	}
	return p
}

// Nudge wakes the dispatcher immediately (used right after ingestion);
// non-blocking because the dispatcher also polls on a ticker — a lost nudge
// only delays work by one interval.
func (p *Pool) Nudge() {
	select {
	case p.nudge <- struct{}{}:
	default:
	}
}

// QueueDepth is the current number of queued (unclaimed) jobs.
func (p *Pool) QueueDepth() int { return len(p.jobs) }

// Start runs the worker pool and the dispatcher until ctx is cancelled.
// Workers drain the channel before exiting (graceful shutdown, PRD §14).
func (p *Pool) Start(ctx context.Context) {
	for i := 0; i < p.cfg.WorkerCount; i++ {
		p.wg.Add(1)
		go p.workerLoop(ctx, i)
	}
	p.wg.Add(1)
	go p.dispatchLoop(ctx)
	p.wg.Add(1)
	go p.staleLoop(ctx)
}

// Wait blocks until all pool goroutines have exited (after cancel).
func (p *Pool) Wait() { p.wg.Wait() }

func (p *Pool) dispatchLoop(ctx context.Context) {
	defer p.wg.Done()
	ticker := time.NewTicker(p.cfg.DispatcherInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		case <-p.nudge:
			// short debounce so a burst of nudges triggers one batch
			select {
			case <-time.After(20 * time.Millisecond):
			case <-ctx.Done():
				return
			}
		}
		p.dispatchOnce(ctx)
	}
}

func (p *Pool) dispatchOnce(ctx context.Context) {
	free := cap(p.jobs) - len(p.jobs)
	if free <= 0 {
		return
	}
	batch := p.cfg.ClaimBatchSize
	if batch > free {
		batch = free
	}
	jobs, err := p.store.ClaimDue(ctx, batch)
	if err != nil {
		if !isCtxErr(err) {
			p.log.Error("dispatch claim failed", "error", err)
		}
		return
	}
	for i := range jobs {
		select {
		case p.jobs <- jobs[i]:
		case <-ctx.Done():
			return
		}
	}
	p.log.Debug("dispatched claims", "count", len(jobs))
}

// staleLoop periodically returns crashed-worker 'processing' deliveries to
// the pending queue (PRD §29: worker crashes must not strand deliveries).
func (p *Pool) staleLoop(ctx context.Context) {
	defer p.wg.Done()
	ticker := time.NewTicker(p.cfg.StaleProcessingTimeout / 2)
	if ticker.C == nil {
		return
	}
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			ids, err := p.store.ResetStaleProcessing(ctx, p.cfg.StaleProcessingTimeout)
			if err != nil {
				if !isCtxErr(err) {
					p.log.Error("reset stale processing failed", "error", err)
				}
				continue
			}
			if len(ids) > 0 {
				p.log.Warn("recovered stale processing deliveries", "count", len(ids))
				p.metrics.DeliveryRetriesTotal.WithLabelValues("stale").Add(float64(len(ids)))
				p.Nudge()
			}
		}
	}
}

func (p *Pool) workerLoop(ctx context.Context, id int) {
	defer p.wg.Done()
	for {
		select {
		case job := <-p.jobs:
			p.process(ctx, job)
		case <-ctx.Done():
			return
		}
	}
}

// slotFor returns the per-endpoint serialization slot (PRD §28). One slot per
// endpoint means deliveries to a subscriber are attempted roughly in
// creation order. ENDPOINT_CONCURRENCY > 1 relaxes that.
func (p *Pool) slotFor(endpointID string) chan struct{} {
	p.slotMu.Lock()
	defer p.slotMu.Unlock()
	ch, ok := p.slots[endpointID]
	if !ok {
		ch = make(chan struct{}, max(1, p.cfg.EndpointConcurrency))
		p.slots[endpointID] = ch
	}
	return ch
}

func (p *Pool) process(ctx context.Context, job model.DeliveryWithEvent) {
	p.inFlight.Add(1)
	defer p.inFlight.Add(-1)
	if p.stats != nil {
		p.stats.SetQueueDepth(len(p.jobs))
		p.stats.SetActiveWorkers(p.inFlight.Load())
	}

	start := time.Now()

	// Best-effort per-endpoint ordering: hold the endpoint slot while sending.
	slot := p.slotFor(job.EndpointID)
	select {
	case slot <- struct{}{}:
		defer func() { <-slot }()
	case <-ctx.Done():
		return
	}

	// Rate limiting (PRD §23). Rate-limit rejections do NOT consume attempts;
	// the delivery is rescheduled a second later.
	if p.limiter != nil {
		ok, err := p.limiter.Allow(ctx, job.Endpoint.ID, job.Endpoint.RateLimit)
		if err != nil {
			// RateLimitFailOpen=true => deliver anyway; false => hold back.
			if !p.cfg.RateLimitFailOpen {
				p.log.Warn("rate limiter unavailable, holding delivery (fail closed)",
					"delivery_id", job.ID, "endpoint_id", job.EndpointID)
				p.recordAttempt(ctx, job, 0, start, "rate limiter unavailable (fail closed)")
				if err := p.store.ScheduleRetry(ctx, job.ID, job.AttemptCount,
					time.Now().Add(time.Second), "rate limiter unavailable (fail closed)"); err != nil {
					p.log.Error("failed to schedule delivery after rate-limiter outage", "error", err)
				}
				return
			}
			p.log.Warn("rate limiter unavailable, delivering anyway (fail open)",
				"endpoint_id", job.EndpointID)
		} else if !ok {
			p.recordAttempt(ctx, job, 0, start, "rate limited")
			if err := p.store.ScheduleRetry(ctx, job.ID, job.AttemptCount,
				time.Now().Add(time.Second), "endpoint rate limit exceeded"); err != nil {
				p.log.Error("failed to schedule rate-limited delivery", "error", err)
			}
			p.metrics.DeliveryRetriesTotal.WithLabelValues(job.EndpointID).Inc()
			return
		}
	}

	res := p.sender.Send(ctx, job.Endpoint, job.Event, job.ID)
	p.recordAttempt(ctx, job, res.StatusCode, start, errString(res.Err))
	p.metrics.DeliveryLatencySeconds.WithLabelValues(job.EndpointID).
		Observe(res.Latency.Seconds())

	switch {
	case res.Err == nil: // 2xx -> DELIVERED (PRD §17)
		if err := p.store.MarkDelivered(ctx, job.ID, job.AttemptCount+1); err != nil {
			p.log.Error("mark delivered failed", "delivery_id", job.ID, "error", err)
			return
		}
		p.metrics.DeliveriesTotal.WithLabelValues(model.StatusDelivered).Inc()
		if p.stats != nil {
			p.stats.Delivered(res.Latency)
		}
		p.log.Info("webhook delivery completed",
			"delivery_id", job.ID, "endpoint_id", job.EndpointID,
			"event_id", job.EventID, "status_code", res.StatusCode,
			"latency_ms", res.Latency.Milliseconds())

	case p.policy.Retryable(res.StatusCode) && !p.policy.Exhausted(job.AttemptCount):
		// RETRYING: persist the schedule; the dispatcher picks it up when due.
		delay := p.policy.NextDelay(job.AttemptCount)
		// Honor Retry-After for 429/503 if the subscriber asked for one.
		if res.StatusCode == 429 || res.StatusCode == 503 {
			if ra := p.policy.RetryAfter(job.AttemptCount, res.RetryAfter); ra > 0 {
				delay = ra
			}
		}
		next := time.Now().Add(delay)
		if err := p.store.ScheduleRetry(ctx, job.ID, job.AttemptCount+1, next, errString(res.Err)); err != nil {
			p.log.Error("schedule retry failed", "delivery_id", job.ID, "error", err)
			return
		}
		p.metrics.DeliveriesTotal.WithLabelValues(model.StatusRetrying).Inc()
		p.metrics.DeliveryRetriesTotal.WithLabelValues(job.EndpointID).Inc()
		p.log.Warn("delivery scheduled for retry",
			"delivery_id", job.ID, "endpoint_id", job.EndpointID,
			"status_code", res.StatusCode, "error", errString(res.Err),
			"next_attempt_at", next.Format(time.RFC3339), "delay_ms", delay.Milliseconds())

	default: // permanent 4xx, exhausted retries, or SSRF block -> DLQ (PRD §20)
		lastErr := errString(res.Err)
		if err := p.store.MarkDeadLetter(ctx, job.ID, job.AttemptCount+1, lastErr); err != nil {
			p.log.Error("mark dead letter failed", "delivery_id", job.ID, "error", err)
			return
		}
		p.metrics.DeliveriesTotal.WithLabelValues(model.StatusDeadLetter).Inc()
		p.metrics.DeadLetterTotal.Inc()
		p.metrics.DeliveryFailuresTotal.WithLabelValues(job.EndpointID).Inc()
		if p.stats != nil {
			p.stats.DeadLettered()
		}
		p.log.Error("delivery dead-lettered",
			"delivery_id", job.ID, "endpoint_id", job.EndpointID,
			"attempts", job.AttemptCount+1, "error", lastErr)
	}
}

func (p *Pool) recordAttempt(ctx context.Context, job model.DeliveryWithEvent,
	statusCode int, started time.Time, errText string) {
	latency := int(time.Since(started).Milliseconds())
	a := model.DeliveryAttempt{
		DeliveryID:     job.ID,
		AttemptNumber:  job.AttemptCount + 1,
		ResponseTimeMs: &latency,
	}
	if statusCode != 0 {
		a.StatusCode = &statusCode
	}
	if errText != "" {
		e := errText
		a.Error = &e
	}
	if err := p.attempts.Insert(ctx, a); err != nil {
		p.log.Error("record attempt failed", "delivery_id", job.ID, "error", err)
	}
}

func isCtxErr(err error) bool {
	return err != nil && (err == context.Canceled || strings.Contains(err.Error(), "context"))
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	s := err.Error()
	if len(s) > 500 {
		s = s[:500]
	}
	return s
}
