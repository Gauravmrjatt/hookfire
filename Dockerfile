# Stage 1: build a static binary with no caches writable
FROM golang:1.22-alpine AS build
WORKDIR /src
ENV CGO_ENABLED=0 GOFLAGS=-trimpath

# dependency layer first for better layer caching
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o /out/hookfire ./cmd/server
RUN go build -o /out/hookfire-token ./cmd/token

# Stage 2: minimal runtime image (migrations run at startup)
FROM alpine:3.20
RUN adduser -D -u 10001 engine
USER engine
COPY --from=build /out/hookfire /usr/local/bin/hookfire
COPY --from=build /out/hookfire-token /usr/local/bin/hookfire-token
# migrations dir is read at startup
COPY migrations /migrations
ENV MIGRATIONS_DIR=/migrations PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://localhost:8080/health || exit 1
ENTRYPOINT ["hookfire"]
