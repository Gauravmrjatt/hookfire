// Package app assembles configuration, infrastructure, services, workers,
// and the HTTP server (composition root). cmd/server/main.go stays thin.
package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"hookfire/internal/config"
	"hookfire/internal/handler"
	"hookfire/internal/metrics"
	"hookfire/internal/middleware"
	"hookfire/internal/ratelimit"
	"hookfire/internal/repository"
	"hookfire/internal/routes"
	"hookfire/internal/service"
	"hookfire/internal/worker"
	"hookfire/pkg/logger"
)

// App is a fully assembled engine instance.
type App struct {
	Cfg    config.Config
	Log    *slog.Logger
	DB     *repository.Endpoints // convenience for tests
	Router http.Handler
	Pool   *worker.Pool

	delivs   *repository.Deliveries
	redis    *ratelimit.Limiter
	statsSvc *service.StatsService
	server   *http.Server
}

// New builds every component. PostgreSQL is required (PRD §29: fail rather
// than accept events we cannot persist); Redis is optional (rate limiting
// disabled when absent — documented behavior).
func New(ctx context.Context, cfg config.Config) (*App, error) {
	log := logger.New(cfg.LogLevel)
	m := metrics.New()

	db, err := repository.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("connect postgres: %w", err)
	}
	if err := repository.Migrate(ctx, db, cfg.MigrationsDir); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	log.Info("postgres ready", "migrations_applied", true)

	limiter, err := ratelimit.New(cfg)
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("connect redis: %w", err)
	}
	if limiter == nil {
		log.Warn("redis not configured — endpoint rate limiting DISABLED (documented behavior)")
	} else {
		log.Info("redis ready", "fail_open", cfg.RateLimitFailOpen)
	}

	// Repositories (raw SQL, PRD §11)
	endpointsRepo := repository.NewEndpoints(db)
	eventsRepo := repository.NewEvents(db)
	deliveriesRepo := repository.NewDeliveries(db)
	attemptsRepo := repository.NewAttempts(db)

	// Services
	statsSvc := service.NewStatsService()

	pool := worker.NewPool(cfg, log, worker.DeliveryStore(deliveriesRepo), attemptsRepo,
		worker.NewSender(cfg, log),
		worker.NewRetryPolicy(cfg.MaxRetries, cfg.InitialRetryDelay, cfg.MaxRetryDelay,
			cfg.BackoffMultiplier, cfg.JitterFraction, cfg.RetryableStatusCodes,
			cfg.PermanentStatusCodes, time.Now().UnixNano()),
		limiter, m, statsSvc)
	nudge := pool.Nudge

	endpointSvc := service.NewEndpointService(endpointsRepo, cfg, log)
	eventSvc := service.NewEventService(eventsRepo, deliveriesRepo, endpointsRepo, cfg, log, m, nudge)
	deliverySvc := service.NewDeliveryService(eventsRepo, deliveriesRepo, attemptsRepo, log, nudge)

	// Handlers + router
	router := routes.New(routes.Deps{
		MaxBodyBytes: cfg.MaxRequestBodyBytes,
		CORSOrigins:  cfg.CORSAllowedOrigins,
		Endpoints:    handler.NewEndpointsHandler(endpointSvc, log),
		Events:       handler.NewEventsHandler(eventSvc, deliverySvc, log),
		Deliveries:   handler.NewDeliveriesHandler(deliverySvc, log),
		Stats:        handler.NewStatsHandler(statsSvc, deliveriesRepo, log),
		Health:       handler.NewHealthHandler(endpointsRepo, limiter, log),
		Auth:         middleware.NewJWTAuth(cfg.JWTSecret),
	})

	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           middleware.Logging(log)(middleware.Recovery(log)(router)),
		ReadHeaderTimeout: 10 * time.Second,
	}

	return &App{
		Cfg: cfg, Log: log, DB: endpointsRepo, Router: router, Pool: pool,
		delivs: deliveriesRepo, redis: limiter, statsSvc: statsSvc, server: server,
	}, nil
}

// Start runs the worker pool on the supplied context (tests inject their own
// cancellable context instead of Run's).
func (a *App) Start(poolCtx context.Context) {
	a.Pool.Start(poolCtx)
}

// Run blocks serving until SIGINT/SIGTERM, then gracefully shuts the HTTP
// server and the worker pool down (PRD §14: workers must shut down
// gracefully; in-flight attempts finish, unfinished ones are recovered later
// by ResetStaleProcessing).
func (a *App) Run() error {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	poolCtx, cancelPool := context.WithCancel(context.Background())
	defer cancelPool()
	a.Start(poolCtx)

	errCh := make(chan error, 1)
	go func() {
		a.Log.Info("hookfire listening", "addr", a.Cfg.HTTPAddr, "env", a.Cfg.Env)
		errCh <- a.server.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("http server: %w", err)
		}
	case <-ctx.Done():
		a.Log.Info("shutdown signal received")
	}

	a.ShutdownHTTP()
	cancelPool()
	a.Pool.Wait()
	a.CloseRedis()
	a.Log.Info("shutdown complete")
	return nil
}

// ShutdownHTTP stops accepting new requests and waits for in-flight ones.
func (a *App) ShutdownHTTP() {
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = a.server.Shutdown(shutdownCtx)
}

// CloseRedis releases the optional Redis connection.
func (a *App) CloseRedis() {
	if a.redis != nil {
		_ = a.redis.Close()
	}
}

// RunRouter exposes the router so tests can serve it over httptest.
func (a *App) RunRouter() http.Handler { return a.Router }

// Deliveries exposes the delivery repo for stats in tests.
func (a *App) Deliveries() *repository.Deliveries { return a.delivs }

// Stats exposes the stats service for tests.
func (a *App) Stats() *service.StatsService { return a.statsSvc }
