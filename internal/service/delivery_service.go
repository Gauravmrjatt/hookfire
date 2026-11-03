package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5"

	"hookfire/internal/model"
	"hookfire/internal/repository"
)

// DeliveryService exposes delivery history, the dead-letter queue, and
// replay (PRD §20/§21).
type DeliveryService struct {
	events   *repository.Events
	delivs   *repository.Deliveries
	attempts *repository.Attempts
	log      *slog.Logger
	nudge    EventNudge
}

func NewDeliveryService(events *repository.Events, delivs *repository.Deliveries,
	attempts *repository.Attempts, log *slog.Logger, nudge EventNudge) *DeliveryService {
	return &DeliveryService{events: events, delivs: delivs, attempts: attempts, log: log, nudge: nudge}
}

// History returns an event and its deliveries.
func (s *DeliveryService) History(ctx context.Context, eventID string) (model.Event, []model.Delivery, error) {
	ev, err := s.events.Get(ctx, eventID)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.Event{}, nil, ErrNotFound
	}
	if err != nil {
		return model.Event{}, nil, err
	}
	dels, err := s.delivs.ListByEvent(ctx, eventID)
	if err != nil {
		return model.Event{ID: eventID}, nil, err
	}
	return ev, dels, nil
}

// Get returns one delivery with its attempts.
func (s *DeliveryService) Get(ctx context.Context, id string) (model.Delivery, []model.DeliveryAttempt, error) {
	d, err := s.delivs.Get(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.Delivery{}, nil, ErrNotFound
	}
	if err != nil {
		return model.Delivery{}, nil, err
	}
	attempts, err := s.attempts.ListByDelivery(ctx, id)
	if err != nil {
		return model.Delivery{}, nil, err
	}
	return d, attempts, nil
}

// ListDeadLetter lists the dead-letter queue.
func (s *DeliveryService) ListDeadLetter(ctx context.Context, limit, offset int) ([]model.Delivery, error) {
	return s.delivs.ListDeadLetter(ctx, limit, offset)
}

// Replay resets a dead-lettered delivery to pending. Does not create a new
// event — the original event id is preserved (PRD §20).
func (s *DeliveryService) Replay(ctx context.Context, id string) (model.Delivery, error) {
	delivery, ok, err := s.delivs.Replay(ctx, id)
	if err != nil {
		return model.Delivery{}, fmt.Errorf("replay delivery: %w", err)
	}
	if !ok {
		return model.Delivery{}, fmt.Errorf("%w: delivery %s is not in the dead-letter queue", ErrValidation, id)
	}
	s.log.Info("delivery replayed", "delivery_id", id, "event_id", delivery.EventID)
	if s.nudge != nil {
		s.nudge()
	}
	return delivery, nil
}
