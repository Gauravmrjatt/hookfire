package service

import (
	"context"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"hookfire/internal/repository"
)

// StatsSink is implemented by StatsService and shared with the worker pool
// so runtime counters (PRD §25) come from instrumentation rather than
// expensive table scans. Only DLQ count still needs DB (bounded, indexed).
type StatsSink interface {
	SetQueueDepth(n int)
	SetActiveWorkers(n int64)
	Delivered(latency time.Duration)
	DeadLettered()
}

// StatsService aggregates run-time delivery statistics for /v1/stats.
type StatsService struct {
	mu            sync.Mutex
	deliveries    atomic.Uint64
	successful    atomic.Uint64
	failed        atomic.Uint64
	deadLettered  atomic.Uint64
	queueDepth    atomic.Int64
	activeWorkers atomic.Int64

	// latency ring for avg / p99 (last 10k attempts)
	latencies []int64
	latIdx    int
	latFull   bool
}

const latencyRingSize = 10000

func NewStatsService() *StatsService {
	return &StatsService{latencies: make([]int64, latencyRingSize)}
}

func (s *StatsService) SetQueueDepth(n int) { s.queueDepth.Store(int64(n)) }
func (s *StatsService) SetActiveWorkers(n int64) {
	s.activeWorkers.Store(n)
}
func (s *StatsService) Delivered(latency time.Duration) {
	s.deliveries.Add(1)
	s.successful.Add(1)
	s.sampleLatency(latency.Milliseconds())
}
func (s *StatsService) DeadLettered() {
	s.deliveries.Add(1)
	s.failed.Add(1)
	s.deadLettered.Add(1)
}

// TerminalCounted is used when a delivery terminates via retry metrics
// directly from workers; kept for completeness.
func (s *StatsService) sampleLatency(ms int64) {
	s.mu.Lock()
	s.latencies[s.latIdx] = ms
	s.latIdx++
	if s.latIdx == latencyRingSize {
		s.latIdx = 0
		s.latFull = true
	}
	s.mu.Unlock()
}

// Snapshot builds the /v1/stats response.
func (s *StatsService) Snapshot(ctx context.Context, dlqCount int) Stats {
	s.mu.Lock()
	latencies := make([]int64, 0, latencyRingSize)
	if s.latFull {
		latencies = append(latencies, s.latencies...)
	} else {
		latencies = append(latencies, s.latencies[:s.latIdx]...)
	}
	s.mu.Unlock()

	var avg, p99 float64
	if len(latencies) > 0 {
		var total int64
		for _, v := range latencies {
			total += v
		}
		avg = float64(total) / float64(len(latencies))
		sort.Slice(latencies, func(i, j int) bool { return latencies[i] < latencies[j] })
		idx := (len(latencies)*99 + 99) / 100
		if idx > 0 {
			idx--
		}
		p99 = float64(latencies[idx])
	}

	successRate := 0.0
	if total := s.deliveries.Load(); total > 0 {
		successRate = float64(s.successful.Load()) / float64(total)
	}
	return Stats{
		QueueDepth:        s.queueDepth.Load(),
		ActiveWorkers:     s.activeWorkers.Load(),
		DeliveriesTotal:   s.deliveries.Load(),
		DeliveriesSuccess: s.successful.Load(),
		DeliveriesFailed:  s.failed.Load(),
		SuccessRate:       successRate,
		DeadLetterCount:   int64(dlqCount),
		AvgLatencyMs:      avg,
		P99LatencyMs:      p99,
	}
}

// Stats is the /v1/stats response shape (PRD §25).
type Stats struct {
	QueueDepth        int64   `json:"queue_depth"`
	ActiveWorkers     int64   `json:"active_workers"`
	DeliveriesTotal   uint64  `json:"deliveries_total"`
	DeliveriesSuccess uint64  `json:"deliveries_successful"`
	DeliveriesFailed  uint64  `json:"deliveries_failed"`
	SuccessRate       float64 `json:"success_rate"`
	DeadLetterCount   int64   `json:"dead_letter_count"`
	AvgLatencyMs      float64 `json:"average_latency_ms"`
	P99LatencyMs      float64 `json:"p99_latency_ms"`
}

// DLQCount queries the indexed DLQ count.
func (s *StatsService) DLQCount(ctx context.Context, delivs *repository.Deliveries) (int, error) {
	return delivs.CountDeadLetter(ctx)
}
