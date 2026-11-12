# Activity — Hookfire operator console

The web dashboard for [Hookfire](../../README.md), the self-hosted webhook delivery
engine. It turns the engine's API into an operator surface: a live delivery feed,
event and delivery explorers, endpoint management, a dead-letter queue with
replay, runtime metrics, and connection settings.

- **Stack** React 19 · TypeScript · Vite 8 · Tailwind CSS v4 · shadcn/ui (Radix) · TanStack Query 5 · zod · cmdk · sonner
- **Accessibility** WCAG 2.2 AA, keyboard-first, visible focus, reduced-motion aware
- **Design system** [`DESIGN_GUIDELINES.md`](./DESIGN_GUIDELINES.md) — tokens, component states, acceptance criteria

---

## Quick start

Two processes: the engine (Go, port 8080) and the dashboard (Vite, port 5173).

### 1. Run the engine

From the repository root:

```bash
docker compose up -d postgres redis      # or: make docker-up

export DATABASE_URL='postgres://webhook:webhook@localhost:5432/webhook_engine?sslmode=disable'
export REDIS_URL='redis://localhost:6379/0'
export JWT_SECRET="$(openssl rand -hex 32)"
export ALLOW_PRIVATE_URLS=true           # only needed to deliver to localhost subscribers
export CORS_ALLOWED_ORIGINS='http://localhost:5173'

make run
```

The engine applies migrations from `MIGRATIONS_DIR` on boot. `GET /health` should
return `{"status":"ok"}`.

### 2. Mint a bearer token

```bash
make token JWT_SECRET="$JWT_SECRET" SUB=operator EXP=12h
```

### 3. Run the dashboard

```bash
cd frontend
bun install
bun run dev
```

Open <http://localhost:5173>. Paste the token on the connect screen — it is
validated against `GET /v1/stats` before it is stored in this browser.

> The Vite dev server proxies `/v1`, `/health`, `/ready`, and `/metrics` to
> `http://localhost:8080`, so no CORS configuration is required in development.

---

## Configuration

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `VITE_API_BASE_URL` | dashboard build/dev | `""` (same origin) | API origin when the engine is not served from the dashboard's origin. Can be overridden per browser in Settings. |
| `CORS_ALLOWED_ORIGINS` | engine | `http://localhost:5173,http://127.0.0.1:5173` | Browser origins allowed to call the API. Only needed for split-origin deployments. |

Connection settings are stored in `localStorage` under `hookfire.baseUrl` and
`hookfire.token`. A rejected token (HTTP 401) is cleared automatically and the
operator is returned to the connect screen.

**Production recommendation:** serve `frontend/dist` and `/v1` from one origin
behind a reverse proxy. That removes CORS and cross-site cookie concerns
entirely.

```nginx
location / {
    root /srv/hookfire/activity;
    try_files $uri /index.html;      # SPA fallback
}

location /v1/ {
    proxy_pass http://hookfire:8080;
    proxy_set_header Host $host;
}

location /metrics {
    # Prometheus exposition. The dashboard's Metrics screen is /observability
    # so this path can stay reserved for the engine.
    proxy_pass http://hookfire:8080;
}
```

---

## Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Vite dev server on :5173 with API proxy |
| `bun run build` | `tsc --noEmit` then production build to `dist/` |
| `bun run typecheck` | Type check only |
| `bun run preview` | Serve the production build locally |

`dist/` is static: host it anywhere. Assets are content-hashed; `index.html`
must not be cached long.

---

## Routes

| Path | Screen | Purpose |
|---|---|---|
| `/` | Activity | Live delivery feed, four health stats, filters, detail sheet |
| `/events` | Events | Paginated event feed with fan-out progress |
| `/events/:id` | Event detail | Payload, delivery fan-out, per-endpoint status |
| `/deliveries` | Deliveries | Delivery explorer with status/endpoint/search filters |
| `/deliveries/:id` | Delivery detail | Attempt log, timings, replay |
| `/endpoints` | Endpoints | Registered subscribers as a card grid |
| `/endpoints/:id` | Endpoint detail | Configuration, signing model, recent deliveries |
| `/dead-letter` | Dead letter | Terminal failures with single and page replay |
| `/observability` | Metrics | Live session charts and the Prometheus instrument reference |
| `/settings` | Settings | Base URL + token, connection test, shortcuts, local data |
| `/login` | Connect | Token entry and validation |
| `*` | 404 | Recovery path back to Activity |

Everything except `/login` requires a stored token (`RequireAuth`); routes are
code-split with `React.lazy`.

---

## Architecture

```
src/
  main.tsx                 QueryClient, TooltipProvider, Router, Toaster
  App.tsx                  Routes, RequireAuth, lazy loading, document titles
  index.css                Design tokens + shadcn compatibility layer
  types/api.ts             Wire types mirroring the Go models
  lib/
    api.ts                 fetch wrapper, ApiError, localStorage config, 401 broadcast
    format.ts              dates, durations, numbers, truncation, idempotency keys
    status.ts              delivery status → label/tone/description (single source)
    ui-events.ts           decoupled UI intents (open send-event dialog)
  hooks/
    queries.ts             every query and mutation, plus the `qk` key factory
    use-stats-history.ts   session-local series + deltas from polled counters
    use-debounced.ts       debounced search, ticking clock
    use-session.ts         token presence, reacts to storage changes
    use-document-title.ts  route titles
  components/
    ui/                    primitives (button, input, dialog, table, …)
    common/                page header, stat card, status badge, states, utilities
    layout/                app shell, sidebar, top bar, command palette
  features/                one folder per screen
```

**Data flow.** Every server interaction goes through `lib/api.ts` and
`hooks/queries.ts`. Query keys are centralised in `qk`; mutations invalidate the
feeds they affect. `GET /v1/events` and `GET /v1/deliveries` are server-paginated
with filters, so the UI never holds the whole table.

**Latest values.** The Activity and Metrics screens poll `GET /v1/stats` every
5 s while live. Charts are built from that session's samples and are labelled as
such — the engine is the source of truth for history via Prometheus.

**Status vocabulary.** `lib/status.ts` maps every engine status to a label, tone,
and plain-language description. No component invents its own wording.

---

## Accessibility

- Skip link, one H1 per route, labelled regions and navigation landmarks.
- Focus is visible everywhere; modals trap and restore focus; `Escape` closes the topmost layer.
- Status is always text + colour, never colour alone.
- Tables use real `th`/`td` semantics inside a labelled, focusable scroll region.
- Forms set `aria-invalid` and `aria-describedby`; errors announce via `role="alert"`.
- `prefers-reduced-motion` disables slides, pulses, and shimmer.
- Touch targets are ≥ 32×32 px; filters and search are server-side so lists stay paginated.

The full acceptance criteria and QA checklist live in
[`DESIGN_GUIDELINES.md`](./DESIGN_GUIDELINES.md) §4 and §7.

---

## Limits and behaviour worth knowing

- **`/metrics` is the engine's, not the dashboard's.** The raw Prometheus endpoint keeps that path, so the Metrics screen lives at `/observability`. Do not add a UI route at `/metrics`; deep links would be proxied to the engine.
- **At-least-once.** Duplicate deliveries are expected; subscribers should deduplicate on `X-Webhook-ID`.
- **Charts are session-local.** Counters come from `/v1/stats`; reloading starts a new window. Prometheus owns history.
- **Relative time needs a clock.** `RelativeTime` re-renders every 15 s; tab-clock drift is corrected on the next tick.
- **No offline cache.** TanStack Query keeps data in memory only; a reload with the engine down shows the error state, not stale data.
- **Tokens are browser-local.** There is no session server and no refresh flow; rotate by reconnecting.
