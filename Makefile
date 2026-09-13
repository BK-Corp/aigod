.PHONY: build push up down dev dev-web start stop restart status logs docker-build docker-push docker-up docker-down docker-clean docker-logs release

# Default IP if not specified
IP ?= 192.168.1.236
# Host port for the aigod web app
PORT ?= 21020

build: ## Build Docker images
	docker compose build

push:
	docker compose push

up:
	IP=$(IP) PORT=$(PORT) docker compose up --build -d

down:
	docker compose down

start: up ## Start all services in the background

stop: down ## Stop all services

restart: stop start ## Restart all services

status: ## Show running container status
	@docker ps --filter "name=aigod" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

logs: ## Tail Docker logs
	docker compose logs -f

dev:
	IP=$(IP) PORT=$(PORT) docker compose up --build

dev-web:
	npm run dev

# Backward-compatible aliases.
docker-build: build
docker-push: push
docker-up: up
docker-down: down

docker-logs:
	docker compose logs -f

docker-clean:
	docker compose down -v --rmi local --remove-orphans

release: ## Bump version, commit and push
	git config core.fileMode false
	python3 scripts/bump_version.py $(if $(BUMP),$(BUMP),patch)
	git add -A && git commit -m "release: bump $(or $(BUMP),patch)" && git push