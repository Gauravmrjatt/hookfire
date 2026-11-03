package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"hookfire/internal/model"
)

// Deliveries is SQL persistence for deliveries plus the DB-backed work queue:
//
// Claims happen with FOR UPDATE SKIP LOCKED (PRD §26), so multiple engine
// instances can disdispatch concurrently without double-processing a delivery.
// Retries are also stored (status = 'retrying', next_attempt_at = due time),
// making the retry schedule durable across crashes of any instance.
type Deliveries struct {
	db *pgxpool.Pool
}

func NewDeliveries(db *pgxpool.Pool) *Deliveries { return &Deliveries{db: db} }

// CreateBatchTx inserts fan-out deliveries (one per endpoint) inside the
// event-ingestion transaction so an event always has a durable plan.
func (r *Deliveries) CreateBatchTx(ctx context.Context, tx pgx.Tx, eventID string, endpoints []model.Endpoint) ([]model.Delivery, error) {
	out := make([]model.Delivery, 0, len(endpoints))
	for _, ep := range endpoints {
		d := model.Delivery{
			ID:         newID("dlv"),
			EventID:    eventID,
			EndpointID: ep.ID,
			Status:     model.StatusPending,
		}
		if _, err := tx.Exec(ctx, `INSERT INTO deliveries
			(id, event_id, endpoint_id, status, next_attempt_at)
			VALUES ($1, $2, $3, $4, now())`, d.ID, d.EventID, d.EndpointID, d.Status); err != nil {
			return nil, fmt.Errorf("insert delivery: %w", err)
		}
		out = append(out, d)
	}
	return out, nil
}

// ClaimDue atomically claims up to limit due deliveries for a worker:
//
//  1. UPDATE due deliveries to 'processing' under row locks, skipping rows
//     locked by other instances (SKIP LOCKED) — no double-processing.
//  2. RETURN the claimed deliveries joined with their event and endpoint.
//
// Due means: pending/retrying with next_attempt_at <= now(). Stale
// 'processing' rows are handled by ResetStaleProcessing, not here.
func (r *Deliveries) ClaimDue(ctx context.Context, limit int) ([]model.DeliveryWithEvent, error) {
	rows, err := r.db.Query(ctx, `
		WITH claimed AS (
			UPDATE deliveries SET status = 'processing', updated_at = now()
			WHERE id IN (
				SELECT id FROM deliveries
				WHERE status IN ('pending','retrying')
				  AND next_attempt_at IS NOT NULL
				  AND next_attempt_at <= now()
				ORDER BY next_attempt_at, created_at
				LIMIT $1
				FOR UPDATE SKIP LOCKED
			)
			RETURNING id
		)
		SELECT d.id, d.event_id, d.endpoint_id, d.status, d.attempt_count,
		       d.next_attempt_at, d.last_attempt_at, d.delivered_at, d.last_error,
		       d.created_at, d.updated_at,
		       e.idempotency_key, e.event_type, e.payload, e.created_at,
		       ep.name, ep.url, ep.secret, ep.active, ep.rate_limit,
		       ep.created_at, ep.updated_at
		FROM claimed c
		JOIN deliveries d ON d.id = c.id
		JOIN events e     ON e.id = d.event_id
		JOIN endpoints ep ON ep.id = d.endpoint_id AND ep.active = TRUE
		ORDER BY d.created_at`, limit)
	if err != nil {
		return nil, fmt.Errorf("claim due deliveries: %w", err)
	}
	defer rows.Close()

	var out []model.DeliveryWithEvent
	for rows.Next() {
		var (
			je      model.DeliveryWithEvent
			payload []byte
		)
		if err := rows.Scan(
			&je.ID, &je.EventID, &je.EndpointID, &je.Status, &je.AttemptCount,
			&je.NextAttemptAt, &je.LastAttemptAt, &je.DeliveredAt, &je.LastError,
			&je.CreatedAt, &je.UpdatedAt,
			&je.Event.IdempotencyKey, &je.Event.EventType, &payload, &je.Event.CreatedAt,
			&je.Endpoint.Name, &je.Endpoint.URL, &je.Endpoint.Secret, &je.Endpoint.Active, &je.Endpoint.RateLimit,
			&je.Endpoint.CreatedAt, &je.Endpoint.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan claimed delivery: %w", err)
		}
		je.Event.ID = je.EventID
		je.Event.Payload = payload
		je.Endpoint.ID = je.EndpointID
		out = append(out, je)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("claim due deliveries: %w", err)
	}
	return out, nil
}

// Get returns a delivery by id; pgx.ErrNoRows when missing.
func (r *Deliveries) Get(ctx context.Context, id string) (model.Delivery, error) {
	d, err := scanDelivery(r.db.QueryRow(ctx, `SELECT `+deliveryCols+` FROM deliveries WHERE id = $1`, id))
	if err != nil {
		return model.Delivery{}, fmt.Errorf("get delivery: %w", err)
	}
	return d, nil
}

// ListByEvent returns the delivery history of one event (PRD §21).
func (r *Deliveries) ListByEvent(ctx context.Context, eventID string) ([]model.Delivery, error) {
	rows, err := r.db.Query(ctx, `SELECT `+deliveryCols+` FROM deliveries
		WHERE event_id = $1 ORDER BY created_at, id`, eventID)
	if err != nil {
		return nil, fmt.Errorf("list deliveries by event: %w", err)
	}
	defer rows.Close()
	out, err := collectDeliveries(rows)
	if err != nil {
		return nil, err
	}
	return out, nil
}

// ListDeadLetter lists deliveries in the dead-letter queue, newest first.
func (r *Deliveries) ListDeadLetter(ctx context.Context, limit, offset int) ([]model.Delivery, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := r.db.Query(ctx, `SELECT `+deliveryCols+` FROM deliveries
		WHERE status = 'dead_letter' ORDER BY updated_at DESC, id LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list dead letters: %w", err)
	}
	defer rows.Close()
	return collectDeliveries(rows)
}

// CountDeadLetter is used by /v1/stats.
func (r *Deliveries) CountDeadLetter(ctx context.Context) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `SELECT count(*) FROM deliveries WHERE status = 'dead_letter'`).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("count dead letters: %w", err)
	}
	return n, nil
}

// MarkDelivered finishes a delivery successfully.
func (r *Deliveries) MarkDelivered(ctx context.Context, id string, attemptCount int) error {
	tag, err := r.db.Exec(ctx, `UPDATE deliveries SET
		status = 'delivered', attempt_count = $2, last_attempt_at = now(),
		delivered_at = now(), last_error = NULL, next_attempt_at = NULL, updated_at = now()
		WHERE id = $1`, id, attemptCount)
	if err != nil {
		return fmt.Errorf("mark delivered: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("mark delivered: delivery %s not found", id)
	}
	return nil
}

// ScheduleRetry parks a failed delivery for its next attempt. The delay is
// computed by the retry policy with jitter, then persisted — so a crash of
// any instance loses nothing (PRD §18/§29).
func (r *Deliveries) ScheduleRetry(ctx context.Context, id string, attemptCount int, next time.Time, lastErr string) error {
	tag, err := r.db.Exec(ctx, `UPDATE deliveries SET
		status = 'retrying', attempt_count = $2, next_attempt_at = $3,
		last_attempt_at = now(), last_error = $4, updated_at = now()
		WHERE id = $1`, id, attemptCount, next, lastErr)
	if err != nil {
		return fmt.Errorf("schedule retry: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("schedule retry: delivery %s not found", id)
	}
	return nil
}

// MarkDeadLetter puts a terminal delivery into the DLQ (max retries reached
// or permanent 4xx — PRD §20).
func (r *Deliveries) MarkDeadLetter(ctx context.Context, id string, attemptCount int, lastErr string) error {
	tag, err := r.db.Exec(ctx, `UPDATE deliveries SET
		status = 'dead_letter', attempt_count = $2, last_attempt_at = now(),
		last_error = $3, next_attempt_at = NULL, updated_at = now()
		WHERE id = $1`, id, attemptCount, lastErr)
	if err != nil {
		return fmt.Errorf("mark dead letter: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("mark dead letter: delivery %s not found", id)
	}
	return nil
}

// Replay resets a dead-lettered delivery to pending for immediate
// re-delivery. It does NOT create a new event — the original event id is
// preserved (PRD §20). Returns false when the delivery was not in the DLQ.
func (r *Deliveries) Replay(ctx context.Context, id string) (model.Delivery, bool, error) {
	tag, err := r.db.Exec(ctx, `UPDATE deliveries SET
		status = 'pending', attempt_count = 0, next_attempt_at = now(),
		last_error = NULL, updated_at = now()
		WHERE id = $1 AND status = 'dead_letter'`, id)
	if err != nil {
		return model.Delivery{}, false, fmt.Errorf("replay delivery: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return model.Delivery{}, false, nil
	}
	d, err := r.Get(ctx, id)
	if err != nil {
		return model.Delivery{}, false, fmt.Errorf("replay delivery: %w", err)
	}
	return d, true, nil
}

// ResetStaleProcessing returns deliveries stuck in 'processing' (worker
// crashed mid-attempt) to the pending queue so they are processed again.
// This bounds duplicate delivery risk and keeps the engine crash-safe
// (PRD §29). Returns the reset delivery ids.
func (r *Deliveries) ResetStaleProcessing(ctx context.Context, olderThan time.Duration) ([]string, error) {
	timeout := fmt.Sprintf("%d milliseconds", olderThan.Milliseconds())
	rows, err := r.db.Query(ctx, `
		UPDATE deliveries SET status = 'pending', next_attempt_at = now(), updated_at = now()
		WHERE id IN (
			SELECT id FROM deliveries
			WHERE status = 'processing'
			  AND updated_at < now() - ($1::interval)
			LIMIT 100
			FOR UPDATE SKIP LOCKED
		)
		RETURNING id`, timeout)
	if err != nil {
		if strings.Contains(err.Error(), "SQLSTATE 42P18") {
			return nil, err
		}
		return nil, fmt.Errorf("reset stale processing: %w", err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan stale delivery id: %w", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("reset stale processing: %w", err)
	}
	return ids, nil
}

// CountsByStatus backs /v1/stats without full-table scans — everything is
// already indexed on status.
func (r *Deliveries) CountsByStatus(ctx context.Context) (map[string]int, error) {
	rows, err := r.db.Query(ctx, `SELECT status, count(*) FROM deliveries GROUP BY status`)
	if err != nil {
		return nil, fmt.Errorf("count deliveries by status: %w", err)
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var status string
		var n int
		if err := rows.Scan(&status, &n); err != nil {
			return nil, fmt.Errorf("scan status count: %w", err)
		}
		out[status] = n
	}
	return out, rows.Err()
}

const deliveryCols = `id, event_id, endpoint_id, status, attempt_count,
	next_attempt_at, last_attempt_at, delivered_at, last_error, created_at, updated_at`

func scanDelivery(row pgx.Row) (model.Delivery, error) {
	var d model.Delivery
	err := row.Scan(&d.ID, &d.EventID, &d.EndpointID, &d.Status, &d.AttemptCount,
		&d.NextAttemptAt, &d.LastAttemptAt, &d.DeliveredAt, &d.LastError,
		&d.CreatedAt, &d.UpdatedAt)
	if err != nil {
		return d, err
	}
	return d, nil
}

func collectDeliveries(rows pgx.Rows) ([]model.Delivery, error) {
	var out []model.Delivery
	for rows.Next() {
		var d model.Delivery
		if err := rows.Scan(&d.ID, &d.EventID, &d.EndpointID, &d.Status, &d.AttemptCount,
			&d.NextAttemptAt, &d.LastAttemptAt, &d.DeliveredAt, &d.LastError,
			&d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan delivery: %w", err)
		}
		out = append(out, d)
	}
	if errors.Is(rows.Err(), context.Canceled) {
		return nil, rows.Err()
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("collect deliveries: %w", err)
	}
	return out, nil
}
