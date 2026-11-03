package model

import (
	"encoding/json"
	"time"
)

// Event is an incoming webhook event persisted before delivery (PRD §8).
type Event struct {
	ID             string          `json:"id"`
	IdempotencyKey string          `json:"-"`
	EventType      string          `json:"event_type"`
	Payload        json.RawMessage `json:"payload"`
	CreatedAt      time.Time       `json:"created_at"`
}

// CreateEventRequest is the API input for POST /v1/events.
type CreateEventRequest struct {
	EventType string          `json:"event_type"`
	Payload   json.RawMessage `json:"payload"`
}
