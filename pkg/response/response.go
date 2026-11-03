// Package response centralizes JSON response writing and the uniform API
// error envelope (PRD §41):
//
//	{"error": {"code": "INVALID_REQUEST", "message": "event_type is required"}}
package response

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

// APIError codes used across handlers.
const (
	CodeInvalidRequest     = "INVALID_REQUEST"
	CodeUnauthorized       = "UNAUTHORIZED"
	CodeForbidden          = "FORBIDDEN"
	CodeNotFound           = "NOT_FOUND"
	CodeConflict           = "CONFLICT"
	CodeTooManyRequests    = "TOO_MANY_REQUESTS"
	CodeInternal           = "INTERNAL_ERROR"
	CodeServiceUnavailable = "SERVICE_UNAVAILABLE"
)

type errorBody struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// JSON writes v as a JSON response body.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("write response body", "error", err)
	}
}

// Error writes the uniform error envelope with the given status.
func Error(w http.ResponseWriter, status int, code, message string) {
	JSON(w, status, errorBody{Error: errorDetail{Code: code, Message: message}})
}

// BadRequest is a 400 convenience wrapper.
func BadRequest(w http.ResponseWriter, message string) {
	Error(w, http.StatusBadRequest, CodeInvalidRequest, message)
}
