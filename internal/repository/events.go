package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"hookfire/internal/model"
)

// Events is SQL persistence for the events table.
type Events struct {
	db *pgxpool.Pool
}

func NewEvents(db *pgxpool.Pool) *Events { return &Events{db: db} }

// Pool exposes the underlying pool for transaction-scoped operations owned
// by services (event ingestion).
func (r *Events) Pool() *pgxpool.Pool { return r.db }

// InsertTx inserts the event within the caller's transaction. The UNIQUE
// constraint on idempotency_key is the concurrency-safe idempotency
// guarantee (PRD §13): two racing inserts — on this instance or any other —
// cannot both succeed. Returns inserted=false when the key already exists.
func (r *Events) InsertTx(ctx context.Context, tx pgx.Tx, ev model.Event) (bool, error) {
	tag, err := tx.Exec(ctx, `INSERT INTO events (id, idempotency_key, event_type, payload, created_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (idempotency_key) DO NOTHING`,
		ev.ID, ev.IdempotencyKey, ev.EventType, ev.Payload, ev.CreatedAt)
	if err != nil {
		return false, fmt.Errorf("insert event: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// GetByIdempotencyKeyTx fetches the event already stored for a key, inside
// the same transaction to dodge races with an in-flight insert.
func (r *Events) GetByIdempotencyKeyTx(ctx context.Context, tx pgx.Tx, key string) (model.Event, bool, error) {
	row := tx.QueryRow(ctx, `SELECT id, idempotency_key, event_type, payload, created_at
		FROM events WHERE idempotency_key = $1`, key)
	ev, err := scanEvent(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.Event{}, false, nil
	}
	if err != nil {
		return model.Event{}, false, fmt.Errorf("get event by idempotency key: %w", err)
	}
	return ev, true, nil
}

// Get returns an event by id; pgx.ErrNoRows when missing.
func (r *Events) Get(ctx context.Context, id string) (model.Event, error) {
	ev, err := scanEvent(r.db.QueryRow(ctx, `SELECT id, idempotency_key, event_type, payload, created_at
		FROM events WHERE id = $1`, id))
	if err != nil {
		return model.Event{}, fmt.Errorf("get event: %w", err)
	}
	return ev, nil
}

func scanEvent(row pgx.Row) (model.Event, error) {
	var ev model.Event
	var payload []byte
	err := row.Scan(&ev.ID, &ev.IdempotencyKey, &ev.EventType, &payload, &ev.CreatedAt)
	if err != nil {
		return ev, err
	}
	ev.Payload = json.RawMessage(payload)
	return ev, nil
}

// RecordIdempotencyKey stores an observability record of a used key. Best
// effort — the events table constraint is the actual guarantee.
func (r *Events) RecordIdempotencyKey(ctx context.Context, tx pgx.Tx, key, eventID string) error {
	_, err := tx.Exec(ctx, `INSERT INTO idempotency_keys (key, event_id) VALUES ($1, $2)
		ON CONFLICT (key) DO NOTHING`, key, eventID)
	if err != nil {
		return fmt.Errorf("record idempotency key: %w", err)
	}
	return nil
}
