package handler

import (
	"log/slog"
	"net/http"

	"hookfire/internal/ratelimit"
	"hookfire/internal/repository"
	"hookfire/pkg/response"
)

// HealthHandler serves /health (liveness) and /ready (readiness).
// Both are public: load balancers and Kubernetes probes call them without
// credentials (PRD §21/§22).
type HealthHandler struct {
	endpoints *repository.Endpoints
	redis     *ratelimit.Limiter
	log       *slog.Logger
}

func NewHealthHandler(endpoints *repository.Endpoints, redis *ratelimit.Limiter,
	log *slog.Logger) *HealthHandler {
	return &HealthHandler{endpoints: endpoints, redis: redis, log: log}
}

// Health is liveness: the process is up. Never touches dependencies.
func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	response.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Ready is readiness: PostgreSQL must respond; Redis is checked when
// configured (a Redis outage with fail-open marking not-ready would stop
// traffic belatedly — so Redis issues degrade readiness only when
// rate limiting is fail-closed).
func (h *HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	if err := h.endpoints.Ping(r.Context()); err != nil {
		response.Error(w, http.StatusServiceUnavailable, response.CodeServiceUnavailable, "postgres not ready")
		return
	}
	if h.redis != nil {
		if err := h.redis.Ping(r.Context()); err != nil {
			response.Error(w, http.StatusServiceUnavailable, response.CodeServiceUnavailable, "redis not ready")
			return
		}
	}
	response.JSON(w, http.StatusOK, map[string]string{"status": "ready"})
}
