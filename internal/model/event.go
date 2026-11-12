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

// EventSummary is one row of the dashboard event feed: the event plus its
// fan-out counters, so the UI can render delivery progress without N+1 calls.
type EventSummary struct {
	Event
	Deliveries int `json:"deliveries"`
	Delivered  int `json:"delivered"`
	InFlight   int `json:"in_flight"`
	DeadLetter int `json:"dead_letter"`
}

// CreateEventRequest is the API input for POST /v1/events.
type CreateEventRequest struct {
	EventType string          `json:"event_type"`
	Payload   json.RawMessage `json:"payload"`
}
