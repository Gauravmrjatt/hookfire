package worker

import (
	"context"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	"hookfire/internal/config"
	"hookfire/internal/model"
)

// fakeStore hands out `total` deliveries across as many ClaimDue calls as it
// takes, never returning more than the requested limit.
type fakeStore struct {
	mu        sync.Mutex
	remaining int
	calls     int
}

func (f *fakeStore) ClaimDue(ctx context.Context, limit int) ([]model.DeliveryWithEvent, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	n := limit
	if n > f.remaining {
		n = f.remaining
	}
	f.remaining -= n
	out := make([]model.DeliveryWithEvent, n)
	for i := range out {
		out[i] = model.DeliveryWithEvent{}
	}
	return out, nil
}

func (f *fakeStore) callCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

func (f *fakeStore) ResetStaleProcessing(context.Context, time.Duration) ([]string, error) {
	return nil, nil
}
func (f *fakeStore) MarkDelivered(context.Context, string, int) error { return nil }
func (f *fakeStore) ScheduleRetry(context.Context, string, int, time.Time, string) error {
	return nil
}
func (f *fakeStore) MarkDeadLetter(context.Context, string, int, string) error { return nil }

func newTestPool(store DeliveryStore, batch, queue int, interval time.Duration) *Pool {
	cfg := config.Config{
		WorkerCount:        1,
		QueueSize:          queue,
		ClaimBatchSize:     batch,
		DispatcherInterval: interval,
	}
	return &Pool{
		cfg:   cfg,
		log:   slog.New(slog.NewTextHandler(io.Discard, nil)),
		store: store,
		jobs:  make(chan model.DeliveryWithEvent, queue),
		nudge: make(chan struct{}, 1),
		slots: map[string]chan struct{}{},
	}
}

// dispatchOnce must report a full claim so the loop knows to keep going.
func TestDispatchOnceReportsFullBatch(t *testing.T) {
	store := &fakeStore{remaining: 100}
	p := newTestPool(store, 10, 40, time.Second)

	claimed, full := p.dispatchOnce(context.Background())
	if claimed != 10 || !full {
		t.Fatalf("full batch: got claimed=%d full=%v, want 10 true", claimed, full)
	}

	// Drain the store so the next claim comes back short.
	store.mu.Lock()
	store.remaining = 3
	store.mu.Unlock()
	for len(p.jobs) > 0 {
		<-p.jobs
	}
	claimed, full = p.dispatchOnce(context.Background())
	if claimed != 3 || full {
		t.Fatalf("short batch: got claimed=%d full=%v, want 3 false", claimed, full)
	}
}

// A full channel must stop the loop rather than spin.
func TestDispatchOnceStopsWhenQueueIsFull(t *testing.T) {
	store := &fakeStore{remaining: 100}
	p := newTestPool(store, 5, 5, time.Second)
	for i := 0; i < 5; i++ {
		p.jobs <- model.DeliveryWithEvent{}
	}
	claimed, full := p.dispatchOnce(context.Background())
	if claimed != 0 || full {
		t.Fatalf("full queue: got claimed=%d full=%v, want 0 false", claimed, full)
	}
	if store.callCount() != 0 {
		t.Fatalf("claimed from the store with a full queue: %d calls", store.callCount())
	}
}

// Regression: the dispatcher used to wait a whole DispatcherInterval between
// batches, which pinned throughput at ClaimBatchSize per tick no matter how
// many workers were idle. With a 10s interval and 100 due deliveries, the old
// implementation made exactly one 5-job claim; the fixed one drains them all
// without waiting for a tick.
func TestDispatchLoopDrainsWithoutWaitingForTick(t *testing.T) {
	store := &fakeStore{remaining: 100}
	p := newTestPool(store, 5, 50, 10*time.Second)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start() normally owns the WaitGroup accounting for the dispatcher.
	p.wg.Add(1)
	go p.dispatchLoop(ctx)

	deadline := time.After(2 * time.Second)
	for {
		if len(p.jobs) >= 50 {
			break
		}
		select {
		case <-deadline:
			t.Fatalf("only %d deliveries claimed and queued; the dispatcher is waiting for the ticker", len(p.jobs))
		case <-time.After(5 * time.Millisecond):
		}
	}
	cancel()
	p.wg.Wait()

	if got := store.callCount(); got < 5 {
		t.Fatalf("ClaimDue called %d times, want at least 5 (one per batch)", got)
	}
}
