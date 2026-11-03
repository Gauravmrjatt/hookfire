// Package routes wires handlers, middleware, and the router (PRD §21).
// Built on Go 1.22+ net/http ServeMux pattern routing — no third-party
// framework (PRD §4).
package routes

import (
	"net/http"

	"github.com/prometheus/client_golang/prometheus/promhttp"

	"hookfire/internal/handler"
	"hookfire/internal/middleware"
)

// Deps is everything the router needs.
type Deps struct {
	MaxBodyBytes int64
	Endpoints    *handler.EndpointsHandler
	Events       *handler.EventsHandler
	Deliveries   *handler.DeliveriesHandler
	Stats        *handler.StatsHandler
	Health       *handler.HealthHandler
	Auth         *middleware.JWTAuth
}

// New builds the full HTTP handler tree:
//
//	Public:        /health, /ready, /metrics
//	Authenticated: /v1/* — JWT auth + request body limit
func New(d Deps) http.Handler {
	// API mux handles paths relative to /v1 (mounted via StripPrefix below).
	api := http.NewServeMux()
	api.HandleFunc("POST /endpoints", d.Endpoints.Create)
	api.HandleFunc("GET /endpoints", d.Endpoints.List)
	api.HandleFunc("GET /endpoints/{id}", d.Endpoints.Get)
	api.HandleFunc("DELETE /endpoints/{id}", d.Endpoints.Delete)

	api.HandleFunc("POST /events", d.Events.Create)
	api.HandleFunc("GET /events/{id}", d.Events.Get)
	api.HandleFunc("GET /events/{id}/deliveries", d.Events.EventDeliveries)

	api.HandleFunc("GET /deliveries/dead-letter", d.Deliveries.DeadLetter)
	api.HandleFunc("GET /deliveries/{id}", d.Deliveries.Delivery)
	api.HandleFunc("POST /deliveries/{id}/replay", d.Deliveries.Replay)

	api.HandleFunc("GET /stats", d.Stats.Stats)

	// Public mux is the root.
	root := http.NewServeMux()
	root.HandleFunc("GET /health", d.Health.Health)
	root.HandleFunc("GET /ready", d.Health.Ready)
	// /metrics is public by default — put an internal-network ACL in front of
	// it if your Prometheus does not scrape from inside the cluster.
	root.Handle("GET /metrics", promhttp.Handler())

	protected := d.Auth.Wrap(bodyLimit(d.MaxBodyBytes, api))
	root.Handle("/v1/", http.StripPrefix("/v1", protected))

	return root
}

// bodyLimit applies http.MaxBytesReader to every API request (PRD §31).
func bodyLimit(n int64, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, n)
		}
		next.ServeHTTP(w, r)
	})
}
