package model

import "time"

// Delivery status values (PRD §9). Transitions are explicit in internal/worker:
//
//	pending --> processing --> delivered
//	                          \--> retrying --> pending/processing (when next_attempt_at is due)
//	                          \--> dead_letter (max retries or permanent failure)
const (
	StatusPending    = "pending"
	StatusProcessing = "processing"
	StatusDelivered  = "delivered"
	StatusRetrying   = "retrying"
	StatusFailed     = "failed"
	StatusDeadLetter = "dead_letter"
)

// All statuses accepted by the DB CHECK constraint.
var DeliveryStatuses = []string{
	StatusPending, StatusProcessing, StatusDelivered,
	StatusRetrying, StatusFailed, StatusDeadLetter,
}

// Delivery is an event destined for one endpoint (PRD §9).
type Delivery struct {
	ID            string     `json:"id"`
	EventID       string     `json:"event_id"`
	EndpointID    string     `json:"endpoint_id"`
	Status        string     `json:"status"`
	AttemptCount  int        `json:"attempt_count"`
	NextAttemptAt *time.Time `json:"next_attempt_at,omitempty"`
	LastAttemptAt *time.Time `json:"last_attempt_at,omitempty"`
	DeliveredAt   *time.Time `json:"delivered_at,omitempty"`
	LastError     *string    `json:"last_error,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// DeliveryRow is a delivery joined with the display fields the dashboard
// needs (event type + endpoint label) — never the endpoint secret.
type DeliveryRow struct {
	Delivery
	EventType    string `json:"event_type"`
	EndpointName string `json:"endpoint_name"`
	EndpointURL  string `json:"endpoint_url"`
}

// DeliveryWithEvent is a delivery joined with its event and endpoint —
// everything a worker needs to perform an HTTP attempt. Produced by the
// batch claimer (SELECT ... FOR UPDATE SKIP LOCKED).
type DeliveryWithEvent struct {
	Delivery
	Event    Event    `json:"-"`
	Endpoint Endpoint `json:"-"`
}
