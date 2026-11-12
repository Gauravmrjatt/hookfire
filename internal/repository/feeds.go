package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"hookfire/internal/model"
)

// This file holds the read-model queries behind the operator dashboard:
// paginated event and delivery feeds. They are deliberately separate from the
// hot delivery path (ClaimDue) — feeds may scan/aggregate, the queue may not.

const (
	feedDefaultLimit = 25
	feedMaxLimit     = 200
)

// EventFilter narrows the event feed.
type EventFilter struct {
	Limit     int
	Offset    int
	EventType string    // exact match
	Query     string    // substring match on event id or event type
	Since     time.Time // zero = no lower bound
}

// DeliveryFilter narrows the delivery feed.
type DeliveryFilter struct {
	Limit      int
	Offset     int
	Statuses   []string // empty = all
	EndpointID string
	EventID    string
	Query      string    // substring match on delivery id
	Since      time.Time // zero = no lower bound
}

func clampFeed(limit, offset int) (int, int) {
	if limit <= 0 {
		limit = feedDefaultLimit
	}
	if limit > feedMaxLimit {
		limit = feedMaxLimit
	}
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}

// ListFeed returns one page of events with their fan-out counters. The
// counters are what the Activity page renders per row ("3/3 delivered",
// "1 in flight", "1 dead letter") without a second round-trip.
func (r *Events) ListFeed(ctx context.Context, f EventFilter) ([]model.EventSummary, int, error) {
	limit, offset := clampFeed(f.Limit, f.Offset)

	where := []string{"TRUE"}
	args := []any{}
	if f.EventType != "" {
		args = append(args, f.EventType)
		where = append(where, fmt.Sprintf("e.event_type = $%d", len(args)))
	}
	if f.Query != "" {
		args = append(args, "%"+f.Query+"%")
		where = append(where, fmt.Sprintf("(e.event_type ILIKE $%d OR e.id ILIKE $%d)", len(args), len(args)))
	}
	if !f.Since.IsZero() {
		args = append(args, f.Since)
		where = append(where, fmt.Sprintf("e.created_at >= $%d", len(args)))
	}
	cond := strings.Join(where, " AND ")

	var total int
	if err := r.db.QueryRow(ctx, `SELECT count(*) FROM events e WHERE `+cond, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count events: %w", err)
	}

	args = append(args, limit, offset)
	rows, err := r.db.Query(ctx, fmt.Sprintf(`
		SELECT e.id, e.event_type, e.payload, e.created_at,
		       count(d.id)                                                AS deliveries,
		       count(*) FILTER (WHERE d.status = 'delivered')              AS delivered,
		       count(*) FILTER (WHERE d.status IN ('pending','processing','retrying')) AS in_flight,
		       count(*) FILTER (WHERE d.status = 'dead_letter')            AS dead_letter
		FROM events e
		LEFT JOIN deliveries d ON d.event_id = e.id
		WHERE %s
		GROUP BY e.id
		ORDER BY e.created_at DESC, e.id DESC
		LIMIT $%d OFFSET $%d`, cond, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list events: %w", err)
	}
	defer rows.Close()

	out := make([]model.EventSummary, 0, limit)
	for rows.Next() {
		var (
			ev      model.EventSummary
			payload []byte
		)
		if err := rows.Scan(&ev.ID, &ev.EventType, &payload, &ev.CreatedAt,
			&ev.Deliveries, &ev.Delivered, &ev.InFlight, &ev.DeadLetter); err != nil {
			return nil, 0, fmt.Errorf("scan event feed: %w", err)
		}
		ev.Payload = json.RawMessage(payload)
		out = append(out, ev)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("list events: %w", err)
	}
	return out, total, nil
}

// ListFeed returns one page of deliveries joined with the event type and the
// endpoint label — exactly the columns the dashboard table needs.
func (r *Deliveries) ListFeed(ctx context.Context, f DeliveryFilter) ([]model.DeliveryRow, int, error) {
	limit, offset := clampFeed(f.Limit, f.Offset)

	where := []string{"TRUE"}
	args := []any{}
	if len(f.Statuses) > 0 {
		args = append(args, f.Statuses)
		where = append(where, fmt.Sprintf("d.status = ANY($%d)", len(args)))
	}
	if f.EndpointID != "" {
		args = append(args, f.EndpointID)
		where = append(where, fmt.Sprintf("d.endpoint_id = $%d", len(args)))
	}
	if f.EventID != "" {
		args = append(args, f.EventID)
		where = append(where, fmt.Sprintf("d.event_id = $%d", len(args)))
	}
	if f.Query != "" {
		args = append(args, "%"+f.Query+"%")
		where = append(where, fmt.Sprintf("(d.id ILIKE $%d OR e.event_type ILIKE $%d)", len(args), len(args)))
	}
	if !f.Since.IsZero() {
		args = append(args, f.Since)
		where = append(where, fmt.Sprintf("d.created_at >= $%d", len(args)))
	}
	cond := strings.Join(where, " AND ")

	var total int
	countSQL := `SELECT count(*) FROM deliveries d
		JOIN events e ON e.id = d.event_id
		WHERE ` + cond
	if err := r.db.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count deliveries: %w", err)
	}

	args = append(args, limit, offset)
	rows, err := r.db.Query(ctx, fmt.Sprintf(`
		SELECT d.id, d.event_id, d.endpoint_id, d.status, d.attempt_count,
		       d.next_attempt_at, d.last_attempt_at, d.delivered_at, d.last_error,
		       d.created_at, d.updated_at,
		       e.event_type, ep.name, ep.url
		FROM deliveries d
		JOIN events e     ON e.id = d.event_id
		JOIN endpoints ep ON ep.id = d.endpoint_id
		WHERE %s
		ORDER BY d.created_at DESC, d.id DESC
		LIMIT $%d OFFSET $%d`, cond, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list deliveries: %w", err)
	}
	defer rows.Close()

	out := make([]model.DeliveryRow, 0, limit)
	for rows.Next() {
		var d model.DeliveryRow
		if err := rows.Scan(&d.ID, &d.EventID, &d.EndpointID, &d.Status, &d.AttemptCount,
			&d.NextAttemptAt, &d.LastAttemptAt, &d.DeliveredAt, &d.LastError,
			&d.CreatedAt, &d.UpdatedAt,
			&d.EventType, &d.EndpointName, &d.EndpointURL); err != nil {
			return nil, 0, fmt.Errorf("scan delivery feed: %w", err)
		}
		out = append(out, d)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("list deliveries: %w", err)
	}
	return out, total, nil
}
