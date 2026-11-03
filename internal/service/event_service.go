package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"

	"hookfire/internal/config"
	"hookfire/internal/metrics"
	"hookfire/internal/model"
	"hookfire/internal/repository"
)

// EventNudge is called after successful ingestion so the dispatcher can pick
// up fresh deliveries without waiting a full poll interval.
type EventNudge func()

// EventService ingests events with transactional idempotency (PRD §12/§13).
//
// Ingestion flow:
//
//	begin txn
//	  INSERT event            (ON CONFLICT (idempotency_key) DO NOTHING)
//	  if conflicting row exists -> txn rolls back, return existing event
//	  SELECT active endpoints
//	  INSERT delivery per endpoint
//	commit
//	nudge dispatcher
//
// The database UNIQUE constraint is the atomic guarantee — racing requests
// (same instance or another) cannot both create an event.
type EventService struct {
	db        *repository.Events
	delivs    *repository.Deliveries
	endpoints *repository.Endpoints
	cfg       config.Config
	log       *slog.Logger
	metrics   *metrics.Metrics
	nudge     EventNudge
}

func NewEventService(db *repository.Events, delivs *repository.Deliveries,
	endpoints *repository.Endpoints, cfg config.Config, log *slog.Logger,
	m *metrics.Metrics, nudge EventNudge) *EventService {
	return &EventService{db: db, delivs: delivs, endpoints: endpoints, cfg: cfg, log: log, metrics: m, nudge: nudge}
}

// AcceptedEvent reports whether this request created the event or hit the
// idempotency key.
type AcceptedEvent struct {
	Event   model.Event
	Created bool // true -> 201 Created, false -> 200 OK idempotent replay
}

// Ingest validates, persists event + fan-out deliveries transactionally,
// and returns idempotent results. The event is durable before it is
// considered accepted (PRD §12) — if persistence fails the API returns 503
// rather than a false 201.
func (s *EventService) Ingest(ctx context.Context, idempotencyKey string, req model.CreateEventRequest) (AcceptedEvent, error) {
	if idempotencyKey == "" {
		return AcceptedEvent{}, fmt.Errorf("%w: Idempotency-Key header is required", ErrValidation)
	}
	if len(idempotencyKey) > 256 {
		return AcceptedEvent{}, fmt.Errorf("%w: Idempotency-Key too long (max 256)", ErrValidation)
	}
	if req.EventType == "" {
		return AcceptedEvent{}, fmt.Errorf("%w: event_type is required", ErrValidation)
	}
	if len(req.EventType) > 200 {
		return AcceptedEvent{}, fmt.Errorf("%w: event_type too long", ErrValidation)
	}
	if len(req.Payload) == 0 {
		req.Payload = []byte(`{}`)
	}
	// Payload must be valid JSON — it is stored as jsonb.
	if !isValidJSON(req.Payload) {
		return AcceptedEvent{}, fmt.Errorf("%w: payload must be valid JSON", ErrValidation)
	}

	event := model.Event{
		ID:             repository.NewID("evt"),
		IdempotencyKey: idempotencyKey,
		EventType:      req.EventType,
		Payload:        req.Payload,
		CreatedAt:      time.Now().UTC(),
	}

	tx, err := s.db.Pool().Begin(ctx)
	if err != nil {
		return AcceptedEvent{}, fmt.Errorf("begin ingestion txn: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	inserted, err := s.db.InsertTx(ctx, tx, event)
	if err != nil {
		return AcceptedEvent{}, fmt.Errorf("insert event: %w", err)
	}

	result := AcceptedEvent{Created: inserted}
	if !inserted {
		// Same key raced (this instance or another): return the original.
		existing, ok, err := s.db.GetByIdempotencyKeyTx(ctx, tx, idempotencyKey)
		if err != nil || !ok {
			return AcceptedEvent{}, fmt.Errorf("load existing event: %w", err)
		}
		result.Event = existing
	} else {
		endpoints, err := s.endpoints.ListActive(ctx)
		if err != nil {
			return AcceptedEvent{}, fmt.Errorf("list active endpoints: %w", err)
		}
		deliveries, err := s.delivs.CreateBatchTx(ctx, tx, event.ID, endpoints)
		if err != nil {
			return AcceptedEvent{}, fmt.Errorf("create deliveries: %w", err)
		}
		if err := s.db.RecordIdempotencyKey(ctx, tx, idempotencyKey, event.ID); err != nil {
			return AcceptedEvent{}, fmt.Errorf("record idempotency key: %w", err)
		}
		result.Event = event
		s.log.Info("event ingested",
			"event_id", event.ID, "event_type", event.EventType,
			"deliveries", len(deliveries))
	}

	if err := tx.Commit(ctx); err != nil {
		return AcceptedEvent{}, fmt.Errorf("commit ingestion: %w", err)
	}

	if result.Created {
		outcome := "accepted"
		s.metrics.EventsTotal.WithLabelValues(outcome).Inc()
		if s.nudge != nil {
			s.nudge()
		}
	}
	return result, nil
}

// Get returns an event by id.
func (s *EventService) Get(ctx context.Context, id string) (model.Event, error) {
	ev, err := s.db.Get(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.Event{}, ErrNotFound
	}
	return ev, err
}

func isValidJSON(b []byte) bool {
	var v any
	return json.Unmarshal(b, &v) == nil
}
