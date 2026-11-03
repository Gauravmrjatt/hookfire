package handler

import (
	"log/slog"
	"net/http"

	"hookfire/internal/repository"
	"hookfire/internal/service"
	"hookfire/pkg/response"
)

// StatsHandler implements GET /v1/stats (PRD §25). Counters start from
// process instrumentation; the DLQ count is the only DB-derived number and
// hits an indexed status column.
type StatsHandler struct {
	stats  *service.StatsService
	delivs *repository.Deliveries
	log    *slog.Logger
}

func NewStatsHandler(stats *service.StatsService, delivs *repository.Deliveries,
	log *slog.Logger) *StatsHandler {
	return &StatsHandler{stats: stats, delivs: delivs, log: log}
}

func (h *StatsHandler) Stats(w http.ResponseWriter, r *http.Request) {
	dlq, err := h.delivs.CountDeadLetter(r.Context())
	if err != nil {
		writeServiceError(w, h.log, err)
		return
	}
	response.JSON(w, http.StatusOK, h.stats.Snapshot(r.Context(), dlq))
}
