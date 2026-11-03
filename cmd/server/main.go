package main

import (
	"context"
	"fmt"
	"os"

	"hookfire/internal/app"
	"hookfire/internal/config"
)

// main boots the hookfire engine: config → postgres + migrations → redis →
// worker pool → HTTP server (PRD Phase 1 acceptance: `go run ./cmd/server`).
func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "configuration error: %v\n", err)
		os.Exit(1)
	}

	ctx := context.Background()
	a, err := app.New(ctx, cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "startup error: %v\n", err)
		os.Exit(1)
	}

	if err := a.Run(); err != nil {
		a.Log.Error("fatal", "error", err)
		os.Exit(1)
	}
}
