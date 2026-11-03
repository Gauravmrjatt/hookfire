.PHONY: help run build fmt vet test test-race test-integration token \
        docker-up docker-down docker-logs clean loadtest

help:
	@echo "targets: run | build | fmt | vet | test | test-race | test-integration | token | docker-up | docker-down"

## run: start the engine locally against localhost postgres/redis
run:
	go run ./cmd/server

## build: compile both binaries into bin/
build:
	mkdir -p bin
	CGO_ENABLED=0 go build -o bin/hookfire ./cmd/server
	CGO_ENABLED=0 go build -o bin/hookfire-token ./cmd/token

## fmt: check formatting
fmt:
	@gofmt -l cmd internal pkg tests \
	  && echo "gofmt: clean"

## vet: static analysis
vet:
	go vet ./...

## test: unit tests (no dependencies needed)
test:
	go test ./...

## test-race: unit tests under the race detector (PRD §34)
test-race:
	go test -race ./...

## test-integration: requires deps: make docker-up first (PRD §33)
test-integration:
	go test -race -count=1 ./tests/integration

## token: print a JWT for local API calls
##   make token JWT_SECRET=mine SUB=demo EXP=1h
token:
	go run ./cmd/token -secret "$(JWT_SECRET)" -sub "$(SUB)" -exp "$(EXP)"

## docker-up: postgres + redis for local dev / integration tests
docker-up:
	docker compose up -d postgres redis
	@sleep 2

## docker-logs: tail postgres/redis logs
docker-logs:
	docker compose logs -f postgres redis

## docker-down:
docker-down:
	docker compose down -v

## loadtest: run the load generator (PRD §35)
loadtest:
	go run ./cmd/loadtest

## clean:
clean:
	rm -rf bin
