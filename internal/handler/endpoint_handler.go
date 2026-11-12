// Package handler maps HTTP requests onto services (PRD §21). Handlers only
// decode/encode — business rules live in internal/service.
package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"hookfire/internal/model"
	"hookfire/internal/service"
	"hookfire/pkg/response"
)

// EndpointsHandler implements the endpoint CRUD API (PRD phase 2).
type EndpointsHandler struct {
	svc *service.EndpointService
	log *slog.Logger
}

func NewEndpointsHandler(svc *service.EndpointService, log *slog.Logger) *EndpointsHandler {
	return &EndpointsHandler{svc: svc, log: log}
}

func (h *EndpointsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateEndpointRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "invalid JSON body: "+err.Error())
		return
	}
	ep, err := h.svc.Create(r.Context(), req)
	if err != nil {
		h.writeError(w, err)
		return
	}
	// The signing secret is returned exactly once, at creation. It is never
	// serialized by model.Endpoint (json:"-") so list/get can't leak it.
	response.JSON(w, http.StatusCreated, struct {
		model.Endpoint
		Secret string `json:"secret"`
	}{Endpoint: ep, Secret: ep.Secret})
}

func (h *EndpointsHandler) List(w http.ResponseWriter, r *http.Request) {
	eps, err := h.svc.List(r.Context())
	if err != nil {
		h.writeError(w, err)
		return
	}
	if eps == nil {
		eps = []model.Endpoint{}
	}
	response.JSON(w, http.StatusOK, eps)
}

func (h *EndpointsHandler) Get(w http.ResponseWriter, r *http.Request) {
	ep, err := h.svc.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		h.writeError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, ep)
}

func (h *EndpointsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.Delete(r.Context(), r.PathValue("id")); err != nil {
		h.writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *EndpointsHandler) writeError(w http.ResponseWriter, err error) {
	writeServiceError(w, h.log, err)
}

// writeServiceError maps service-domain errors onto HTTP statuses (PRD §41).
func writeServiceError(w http.ResponseWriter, log *slog.Logger, err error) {
	switch {
	case errors.Is(err, service.ErrValidation):
		response.BadRequest(w, err.Error())
	case errors.Is(err, service.ErrNotFound):
		response.Error(w, http.StatusNotFound, response.CodeNotFound, err.Error())
	default:
		log.Error("internal error", "error", err)
		response.Error(w, http.StatusInternalServerError, response.CodeInternal, "internal server error")
	}
}

func queryInt(r *http.Request, key string, def, max int) int {
	v := r.URL.Query().Get(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 0 {
		return def
	}
	if n > max {
		return max
	}
	return n
}
