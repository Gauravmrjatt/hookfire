package service

import (
	"context"
	"testing"
	"time"
)

// Regression: latencies were truncated to whole milliseconds before being
// recorded, so a subscriber that answers in under 1ms recorded 0 and
// /v1/stats reported average_latency_ms = 0.0002 / p99 = 0.
func TestSnapshotReportsSubMillisecondLatency(t *testing.T) {
	s := NewStatsService()
	for i := 0; i < 100; i++ {
		s.Delivered(250 * time.Microsecond)
	}

	got := s.Snapshot(context.Background(), 0)
	if got.AvgLatencyMs < 0.20 || got.AvgLatencyMs > 0.30 {
		t.Fatalf("average_latency_ms = %v, want about 0.25", got.AvgLatencyMs)
	}
	if got.P99LatencyMs < 0.20 || got.P99LatencyMs > 0.30 {
		t.Fatalf("p99_latency_ms = %v, want about 0.25", got.P99LatencyMs)
	}
}

// Whole-millisecond latencies keep working after the unit change.
func TestSnapshotReportsMillisecondLatency(t *testing.T) {
	s := NewStatsService()
	for i := 0; i < 50; i++ {
		s.Delivered(12 * time.Millisecond)
	}

	got := s.Snapshot(context.Background(), 0)
	if got.AvgLatencyMs < 11.5 || got.AvgLatencyMs > 12.5 {
		t.Fatalf("average_latency_ms = %v, want about 12", got.AvgLatencyMs)
	}
	if got.P99LatencyMs < 11.5 || got.P99LatencyMs > 12.5 {
		t.Fatalf("p99_latency_ms = %v, want about 12", got.P99LatencyMs)
	}
}

// Counters still count, and success rate is derived from them.
func TestSnapshotCounters(t *testing.T) {
	s := NewStatsService()
	s.Delivered(2 * time.Millisecond)
	s.Delivered(3 * time.Millisecond)
	s.DeadLettered()

	got := s.Snapshot(context.Background(), 7)
	if got.DeliveriesTotal != 3 || got.DeliveriesSuccess != 2 || got.DeadLetterCount != 7 {
		t.Fatalf("unexpected counters: %+v", got)
	}
	if got.SuccessRate <= 0.66 || got.SuccessRate >= 0.67 {
		t.Fatalf("success_rate = %v, want about 0.667", got.SuccessRate)
	}
}
