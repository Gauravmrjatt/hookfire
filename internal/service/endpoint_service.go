// Package service contains the business logic, decoupled from HTTP
// (PRD §47 rule 8). Services own validation, transactions, and fan-out;
// handlers only marshal/unmarshal.
package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/url"

	"github.com/jackc/pgx/v5"

	"hookfire/internal/config"
	"hookfire/internal/model"
	"hookfire/internal/repository"
)

var (
	// ErrNotFound is returned when a resource does not exist.
	ErrNotFound = errors.New("not found")
	// ErrValidation is returned for invalid user input.
	ErrValidation = errors.New("validation failed")
)

// EndpointService manages subscriber webhook endpoints (PRD phase 2).
type EndpointService struct {
	db  *repository.Endpoints
	cfg config.Config
	log *slog.Logger
}

func NewEndpointService(db *repository.Endpoints, cfg config.Config, log *slog.Logger) *EndpointService {
	return &EndpointService{db: db, cfg: cfg, log: log}
}

// Create validates and registers a new endpoint. Secrets are generated
// server-side unless supplied (PRD §31: secrets in env/config, generated
// per-endpoint secrets are returned once to the caller).
func (s *EndpointService) Create(ctx context.Context, req model.CreateEndpointRequest) (model.Endpoint, error) {
	if req.Name == "" {
		return model.Endpoint{}, fmt.Errorf("%w: name is required", ErrValidation)
	}
	if len(req.Name) > 200 {
		return model.Endpoint{}, fmt.Errorf("%w: name too long", ErrValidation)
	}
	if req.URL == "" {
		return model.Endpoint{}, fmt.Errorf("%w: url is required", ErrValidation)
	}
	u, err := url.ParseRequestURI(req.URL)
	if err != nil {
		return model.Endpoint{}, fmt.Errorf("%w: url is not a valid absolute URL", ErrValidation)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return model.Endpoint{}, fmt.Errorf("%w: url scheme must be http or https", ErrValidation)
	}
	secret := req.Secret
	if secret == "" {
		secret = repository.RandomHex(32)
	}

	ep := model.Endpoint{
		ID:        repository.NewID("ep"),
		Name:      req.Name,
		URL:       req.URL,
		Secret:    secret,
		Active:    true,
		RateLimit: req.RateLimit,
	}
	if err := s.db.Create(ctx, ep); err != nil {
		return model.Endpoint{}, fmt.Errorf("save endpoint: %w", err)
	}
	s.log.Info("endpoint created", "endpoint_id", ep.ID, "name", ep.Name, "scheme", u.Scheme)
	return ep, nil
}

func (s *EndpointService) List(ctx context.Context) ([]model.Endpoint, error) {
	return s.db.List(ctx)
}

func (s *EndpointService) Get(ctx context.Context, id string) (model.Endpoint, error) {
	ep, err := s.db.Get(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.Endpoint{}, ErrNotFound
	}
	return ep, err
}

// Delete soft-deletes an endpoint: the row stays for delivery FK/history,
// but it stops receiving new events.
func (s *EndpointService) Delete(ctx context.Context, id string) error {
	deleted, err := s.db.SoftDelete(ctx, id)
	if err != nil {
		return err
	}
	if !deleted {
		return ErrNotFound
	}
	s.log.Info("endpoint deleted", "endpoint_id", id)
	return nil
}
