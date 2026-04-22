.PHONY: dev test test-coverage test-e2e build \
        docker-up docker-down migrate lint \
        docker-build-server docker-build-api docker-build-client \
        k8s-apply-dev k8s-status help

# ─── Development ────────────────────────────────────────────────────────────

dev: ## Start development server with hot reload
	npm run dev

# ─── Testing ────────────────────────────────────────────────────────────────

test: ## Run unit tests
	npm test

test-coverage: ## Run unit tests with coverage report
	npm test -- --coverage

test-e2e: ## Run Playwright E2E tests
	npx playwright test

# ─── Build ──────────────────────────────────────────────────────────────────

build: ## Compile TypeScript to dist/
	npm run build

# ─── Docker Compose ─────────────────────────────────────────────────────────

docker-up: ## Start all services via Docker Compose (detached)
	docker compose -f infra/docker-compose.yml up -d

docker-down: ## Stop all Docker Compose services
	docker compose -f infra/docker-compose.yml down

# ─── Database ───────────────────────────────────────────────────────────────

migrate: ## Run database migrations
	npm run migrate

# ─── Lint & Type Check ──────────────────────────────────────────────────────

lint: ## Run ESLint and TypeScript type check
	npm run lint && npm run typecheck

# ─── Docker Image Builds ────────────────────────────────────────────────────

docker-build-server: ## Build the game server Docker image (local tag)
	docker build -f infra/Dockerfile.server -t sam-gong-server:local .

docker-build-api: ## Build the API Docker image (local tag)
	docker build -f infra/Dockerfile.api -t sam-gong-api:local .

docker-build-client: ## Build the client Docker image (local tag)
	docker build -f infra/Dockerfile.client -t sam-gong-client:local .

# ─── Kubernetes ─────────────────────────────────────────────────────────────

k8s-apply-dev: ## Apply all k8s manifests to sam-gong namespace
	kubectl apply -f infra/k8s/ -n sam-gong

k8s-status: ## Show pod, service, and ingress status in sam-gong namespace
	kubectl get pods,svc,ingress -n sam-gong

# ─── Help ───────────────────────────────────────────────────────────────────

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
