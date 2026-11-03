// Package model contains the core domain types (PRD §7–§10).
package model

import "time"

// Endpoint is a registered subscriber webhook URL (PRD §7).
type Endpoint struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	URL       string    `json:"url"`
	Secret    string    `json:"-"` // never serialized to API responses (PRD §32)
	Active    bool      `json:"active"`
	RateLimit int       `json:"rate_limit"` // deliveries per second; 0 = engine default
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// CreateEndpointRequest is the API input for POST /v1/endpoints.
type CreateEndpointRequest struct {
	Name      string `json:"name"`
	URL       string `json:"url"`
	RateLimit int    `json:"rate_limit"`
	// Secret is optional. When omitted the engine generates a random secret;
	// the response of POST /v1/endpoints is the only time it can be retrieved.
	Secret string `json:"secret"`
}
