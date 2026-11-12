package handler

import (
	"log/slog"
	"net/http"
	"strings"

	"hookfire/internal/model"
	"hookfire/internal/repository"
	"hookfire/internal/service"
	"hookfire/pkg/response"
)

// DeliveriesHandler implements delivery history, DLQ, and replay (PRD §21).
type DeliveriesHandler struct {
	svc *service.DeliveryService
	log *slog.Logger
}

func NewDeliveriesHandler(svc *service.DeliveryService, log *slog.Logger) *DeliveriesHandler {
	return &DeliveriesHandler{svc: svc, log: log}
}

// DeadLetter implements GET /v1/deliveries/dead-letter.
func (h *DeliveriesHandler) DeadLetter(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.ListDeadLetter(r.Context(),
		queryInt(r, "limit", 50, 100), queryInt(r, "offset", 0, 1_000_000_000))
	if err != nil {
		writeServiceError(w, h.log, err)
		return
	}
	if items == nil {
		items = []model.Delivery{}
	}
	response.JSON(w, http.StatusOK, map[string]any{"items": items})
}

// List implements GET /v1/deliveries — the dashboard delivery explorer.
func (h *DeliveriesHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page, err := h.svc.List(r.Context(), repository.DeliveryFilter{
		Limit:      queryInt(r, "limit", 25, 200),
		Offset:     queryInt(r, "offset", 0, 1_000_000_000),
		Statuses:   splitCSV(q.Get("status")),
		EndpointID: q.Get("endpoint_id"),
		EventID:    q.Get("event_id"),
		Query:      q.Get("q"),
	})
	if err != nil {
		writeServiceError(w, h.log, err)
		return
	}
	response.JSON(w, http.StatusOK, page)
}

// splitCSV turns "pending,retrying" into a validated-by-service status list.
func splitCSV(v string) []string {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// Replay implements POST /v1/deliveries/{id}/replay (PRD §20).
func (h *DeliveriesHandler) Replay(w http.ResponseWriter, r *http.Request) {
	delivery, err := h.svc.Replay(r.Context(), r.PathValue("id"))
	if err != nil {
		writeServiceError(w, h.log, err)
		return
	}
	response.JSON(w, http.StatusAccepted, map[string]any{
		"status":   "replayed",
		"delivery": delivery,
	})
}

// Delivery implements GET /v1/deliveries/{id} with attempt history.
func (h *DeliveriesHandler) Delivery(w http.ResponseWriter, r *http.Request) {
	delivery, attempts, err := h.svc.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		writeServiceError(w, h.log, err)
		return
	}
	if attempts == nil {
		attempts = []model.DeliveryAttempt{}
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"delivery": delivery,
		"attempts": attempts,
	})
}
