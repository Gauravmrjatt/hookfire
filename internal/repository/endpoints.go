package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"hookfire/internal/model"
)

// Endpoints is SQL persistence for the endpoints table.
type Endpoints struct {
	db *pgxpool.Pool
}

func NewEndpoints(db *pgxpool.Pool) *Endpoints { return &Endpoints{db: db} }

// CreateTx inserts an endpoint inside the caller's transaction (used together
// with event ingestion when needed) — parameterized throughout (PRD §31).
func (r *Endpoints) CreateTx(ctx context.Context, tx pgx.Tx, ep model.Endpoint) error {
	_, err := tx.Exec(ctx, `INSERT INTO endpoints (id, name, url, secret, active, rate_limit)
		VALUES ($1, $2, $3, $4, $5, $6)`,
		ep.ID, ep.Name, ep.URL, ep.Secret, ep.Active, ep.RateLimit)
	if err != nil {
		return fmt.Errorf("insert endpoint: %w", err)
	}
	return nil
}

// Create inserts an endpoint outside a transaction.
func (r *Endpoints) Create(ctx context.Context, ep model.Endpoint) error {
	_, err := r.db.Exec(ctx, `INSERT INTO endpoints (id, name, url, secret, active, rate_limit)
		VALUES ($1, $2, $3, $4, $5, $6)`,
		ep.ID, ep.Name, ep.URL, ep.Secret, ep.Active, ep.RateLimit)
	if err != nil {
		return fmt.Errorf("insert endpoint: %w", err)
	}
	return nil
}

const endpointCols = `id, name, url, secret, active, rate_limit, created_at, updated_at`

func scanEndpoint(row pgx.Row) (model.Endpoint, error) {
	var ep model.Endpoint
	err := row.Scan(&ep.ID, &ep.Name, &ep.URL, &ep.Secret, &ep.Active, &ep.RateLimit, &ep.CreatedAt, &ep.UpdatedAt)
	if err != nil {
		return ep, err
	}
	return ep, nil
}

// Get returns the endpoint with id; pgx.ErrNoRows when missing.
func (r *Endpoints) Get(ctx context.Context, id string) (model.Endpoint, error) {
	ep, err := scanEndpoint(r.db.QueryRow(ctx,
		`SELECT `+endpointCols+` FROM endpoints WHERE id = $1`, id))
	if err != nil {
		return model.Endpoint{}, fmt.Errorf("get endpoint: %w", err)
	}
	return ep, nil
}

// List returns all endpoints ordered by creation.
func (r *Endpoints) List(ctx context.Context) ([]model.Endpoint, error) {
	rows, err := r.db.Query(ctx,
		`SELECT `+endpointCols+` FROM endpoints ORDER BY created_at, id`)
	if err != nil {
		return nil, fmt.Errorf("list endpoints: %w", err)
	}
	defer rows.Close()

	var out []model.Endpoint
	for rows.Next() {
		var ep model.Endpoint
		if err := rows.Scan(&ep.ID, &ep.Name, &ep.URL, &ep.Secret, &ep.Active, &ep.RateLimit,
			&ep.CreatedAt, &ep.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan endpoint: %w", err)
		}
		out = append(out, ep)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list endpoints: %w", err)
	}
	return out, nil
}

// ListActive returns only active endpoints at this instant.
func (r *Endpoints) ListActive(ctx context.Context) ([]model.Endpoint, error) {
	rows, err := r.db.Query(ctx,
		`SELECT `+endpointCols+` FROM endpoints WHERE active = TRUE ORDER BY created_at, id`)
	if err != nil {
		return nil, fmt.Errorf("list active endpoints: %w", err)
	}
	defer rows.Close()

	var out []model.Endpoint
	for rows.Next() {
		var ep model.Endpoint
		if err := rows.Scan(&ep.ID, &ep.Name, &ep.URL, &ep.Secret, &ep.Active, &ep.RateLimit,
			&ep.CreatedAt, &ep.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan endpoint: %w", err)
		}
		out = append(out, ep)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list active endpoints: %w", err)
	}
	return out, nil
}

// SoftDelete deactivates the endpoint. Deliveries already in flight may still
// complete, but no new deliveries are fanned out to it.
func (r *Endpoints) SoftDelete(ctx context.Context, id string) (bool, error) {
	tag, err := r.db.Exec(ctx,
		`UPDATE endpoints SET active = FALSE, updated_at = now() WHERE id = $1 AND active`, id)
	if err != nil {
		return false, fmt.Errorf("deactivate endpoint: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// Ping is a cheap liveness probe for readiness checks.
func (r *Endpoints) Ping(ctx context.Context) error {
	return r.db.Ping(ctx)
}
