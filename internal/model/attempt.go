package model

import "time"

// DeliveryAttempt records every individual HTTP attempt (PRD §10),
// including ones that failed before receiving a response (status_code NULL).
type DeliveryAttempt struct {
	ID             int64     `json:"id"`
	DeliveryID     string    `json:"delivery_id"`
	AttemptNumber  int       `json:"attempt_number"`
	StatusCode     *int      `json:"status_code,omitempty"`
	ResponseTimeMs *int      `json:"response_time_ms,omitempty"`
	Error          *string   `json:"error,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}
