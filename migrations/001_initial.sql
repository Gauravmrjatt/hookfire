-- 001_initial.sql — baseline schema for the webhook delivery engine.
-- Applied transactionally by internal/repository.Migrate, tracked in schema_migrations.

CREATE TABLE IF NOT EXISTS endpoints (
    id          TEXT PRIMARY KEY,                -- ep_<random>
    name        TEXT NOT NULL,
    url         TEXT NOT NULL,
    secret      TEXT NOT NULL,                   -- HMAC signing secret, never returned by the API
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    rate_limit  INTEGER NOT NULL DEFAULT 0,      -- per-second delivery cap; 0 = engine default
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS endpoints_active_idx ON endpoints (active);

CREATE TABLE IF NOT EXISTS events (
    id              TEXT PRIMARY KEY,            -- evt_<random>
    idempotency_key TEXT NOT NULL UNIQUE,        -- supplied by the caller in the Idempotency-Key header
    event_type      TEXT NOT NULL,
    payload         JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Explicitly satisfy the PRD's required index list.
CREATE INDEX IF NOT EXISTS events_id_idx ON events (id);
CREATE INDEX IF NOT EXISTS idempotency_keys_key_idx ON events (idempotency_key);

CREATE TABLE IF NOT EXISTS deliveries (
    id              TEXT PRIMARY KEY,            -- dlv_<random>
    event_id        TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    endpoint_id     TEXT NOT NULL REFERENCES endpoints(id),
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','delivered','retrying','failed','dead_letter')),
    attempt_count   INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deliveries_status_idx      ON deliveries (status);
CREATE INDEX IF NOT EXISTS deliveries_next_attempt_idx ON deliveries (next_attempt_at);
CREATE INDEX IF NOT EXISTS deliveries_endpoint_idx    ON deliveries (endpoint_id);
CREATE INDEX IF NOT EXISTS deliveries_event_idx       ON deliveries (event_id);

CREATE TABLE IF NOT EXISTS delivery_attempts (
    id               BIGSERIAL PRIMARY KEY,
    delivery_id      TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    attempt_number   INTEGER NOT NULL,
    status_code      INTEGER,                    -- NULL when the request never got a response
    response_time_ms INTEGER,
    error            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_attempts_delivery_idx ON delivery_attempts (delivery_id, attempt_number);

-- Auxiliary idempotency bookkeeping table. The unique constraint on
-- events.idempotency_key is the hard guarantee; this table records intended
-- keys for observability (e.g. keys seen but the event write raced).
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key        TEXT PRIMARY KEY,
    event_id   TEXT REFERENCES events(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idempotency_keys_event_idx ON idempotency_keys (event_id);
