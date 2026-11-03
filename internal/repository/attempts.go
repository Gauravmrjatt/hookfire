package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"hookfire/internal/model"
)

// Attempts is SQL persistence for delivery_attempts — every HTTP attempt,
// successful or not, is recorded for debugging and metrics (PRD §10).
type Attempts struct {
	db *pgxpool.Pool
}

func NewAttempts(db *pgxpool.Pool) *Attempts { return &Attempts{db: db} }

// Insert records one attempt inside the delivery state update transaction
// space (statuses/invariants handled by the worker pipeline).
func (r *Attempts) Insert(ctx context.Context, a model.DeliveryAttempt) error {
	_, err := r.db.Exec(ctx, `INSERT INTO delivery_attempts
		(delivery_id, attempt_number, status_code, response_time_ms, error)
		VALUES ($1, $2, $3, $4, $5)`,
		a.DeliveryID, a.AttemptNumber, a.StatusCode, a.ResponseTimeMs, a.Error)
	if err != nil {
		return fmt.Errorf("insert delivery attempt: %w", err)
	}
	return nil
}

// ListByDelivery returns attempts ordered by attempt number (PRD §21).
func (r *Attempts) ListByDelivery(ctx context.Context, deliveryID string) ([]model.DeliveryAttempt, error) {
	rows, err := r.db.Query(ctx, `SELECT id, delivery_id, attempt_number, status_code,
		response_time_ms, error, created_at
		FROM delivery_attempts WHERE delivery_id = $1 ORDER BY attempt_number, id`, deliveryID)
	if err != nil {
		return nil, fmt.Errorf("list delivery attempts: %w", err)
	}
	defer rows.Close()

	var out []model.DeliveryAttempt
	for rows.Next() {
		var a model.DeliveryAttempt
		if err := rows.Scan(&a.ID, &a.DeliveryID, &a.AttemptNumber, &a.StatusCode,
			&a.ResponseTimeMs, &a.Error, &a.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan delivery attempt: %w", err)
		}
		out = append(out, a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list delivery attempts: %w", err)
	}
	return out, nil
}
