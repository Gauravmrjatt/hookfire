// Package logger provides the structured logger used across the service
// (PRD §32: log/slog, JSON output). Secrets, tokens, and payloads are never
// passed to log calls by convention.
package logger

import (
	"log/slog"
	"os"
	"strings"
)

// New returns a JSON slog.Logger at the requested level.
func New(level string) *slog.Logger {
	var lvl slog.Level
	switch strings.ToLower(level) {
	case "debug":
		lvl = slog.LevelDebug
	case "warn", "warning":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: lvl}))
}
