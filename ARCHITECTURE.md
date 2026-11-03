# Architecture

```text
cmd/server/              executable entrypoint
internal/config/          environment-backed configuration
internal/handler/         HTTP request handlers
internal/service/         application use cases
internal/repository/      persistence contracts and implementations
internal/model/           endpoint, event, delivery, and user contracts
internal/middleware/      JWT and cross-cutting HTTP middleware
internal/routes/          route registration
internal/worker/          asynchronous webhook delivery
pkg/logger/               reusable logging seam
pkg/response/             reusable API response helpers
migrations/               PostgreSQL schema
deployments/              Docker and Kubernetes assets
```

The executable now lives in `cmd/server`. The existing vertical slice remains behavior-compatible while the package seams are established for moving the store, handlers, repositories, and worker implementation behind explicit interfaces.
