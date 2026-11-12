package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"hookfire/internal/model"
	"hookfire/internal/service"
	"hookfire/pkg/response"
)

// EventsHandler implements event ingestion + lookup (PRD phase 3).
type EventsHandler struct {
	svc        *service.EventService
	deliveries *service.DeliveryService
	log        *slog.Logger
}

func NewEventsHandler(svc *service.EventService, deliveries *service.DeliveryService,
	log *slog.Logger) *EventsHandler {
	return &EventsHandler{svc: svc, deliveries: deliveries, log: log}
}

// Create implements POST /v1/events (PRD §12): JWT (applied by middleware),
// Idempotency-Key, validated payload, durable persistence, 201 vs 200.
func (h *EventsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid JSON body: "+err.Error())
		return
	}

	accepted, err := h.svc.Ingest(r.Context(), r.Header.Get("Idempotency-Key"), req)
	if err != nil {
		writeServiceError(w, h.log, err)
		return
	}
	if accepted.Created {
		response.JSON(w, http.StatusCreated, accepted.Event)
		return
	}
	// Idempotent replay of the same key (PRD §13).
	response.JSON(w, http.StatusOK, accepted.Event)
}

// List implements GET /v1/events — newest first, paginated, with fan-out
// counters for the dashboard activity feed.
func (h *EventsHandler) List(w http.ResponseWriter, r *http.Request) {
	page, err := h.svc.List(r.Context(),
		queryInt(r, "limit", 25, 200),
		queryInt(r, "offset", 0, 1_000_000_000),
		r.URL.Query().Get("event_type"),
		r.URL.Query().Get("q"))
	if err != nil {
		writeServiceError(w, h.log, err)
		return
	}
	response.JSON(w, http.StatusOK, page)
}

func (h *EventsHandler) Get(w http.ResponseWriter, r *http.Request) {
	ev, err := h.svc.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		writeServiceError(w, h.log, err)
		return
	}
	response.JSON(w, http.StatusOK, ev)
}

// EventDeliveries implements GET /v1/events/{id}/deliveries (PRD §21).
func (h *EventsHandler) EventDeliveries(w http.ResponseWriter, r *http.Request) {
	ev, deliveries, err := h.deliveries.History(r.Context(), r.PathValue("id"))
	if err != nil {
		writeServiceError(w, h.log, err)
		return
	}
	if deliveries == nil {
		deliveries = []model.Delivery{}
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"event":      ev,
		"deliveries": deliveries,
	})
}
