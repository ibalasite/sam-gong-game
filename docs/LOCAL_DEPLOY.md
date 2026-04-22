# Sam Gong (三公) — Local Deployment Manual

This guide walks you through setting up and running the Sam Gong multiplayer card game locally, from bare prerequisites to a fully functional Minikube deployment.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone and Setup](#2-clone-and-setup)
3. [Install Dependencies](#3-install-dependencies)
4. [Environment Configuration](#4-environment-configuration)
5. [Local Dev: Docker Compose (Postgres + Redis)](#5-local-dev-docker-compose)
6. [Run Database Migrations](#6-run-database-migrations)
7. [Start Development Servers](#7-start-development-servers)
8. [Run Tests](#8-run-tests)
9. [Minikube Kubernetes Deployment](#9-minikube-kubernetes-deployment)
10. [Verify Health and Game Flow](#10-verify-health-and-game-flow)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Prerequisites

Install the following tools before proceeding.

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20 LTS | https://nodejs.org or `nvm install 20` |
| Docker Desktop | Latest | https://www.docker.com/products/docker-desktop |
| kubectl | 1.28+ | https://kubernetes.io/docs/tasks/tools/ |
| minikube | 1.32+ | https://minikube.sigs.k8s.io/docs/start/ |
| git | Any | https://git-scm.com |

Verify installations:

```bash
node --version     # v20.x.x
docker --version   # Docker version 24.x.x
kubectl version    # v1.28+
minikube version   # v1.32+
```

---

## 2. Clone and Setup

```bash
git clone https://github.com/your-org/sam-gong-game.git
cd sam-gong-game
```

Generate RSA keys for JWT authentication:

```bash
mkdir -p keys
openssl genrsa -out keys/private.pem 4096
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
chmod 600 keys/private.pem
```

> **Security**: Never commit the `keys/` directory to git. It is already listed in `.gitignore`.

---

## 3. Install Dependencies

```bash
npm install
```

This installs all backend and tooling dependencies. Frontend dependencies are managed separately in `client/`:

```bash
cd client && npm install && cd ..
```

---

## 4. Environment Configuration

Copy the template and fill in values:

```bash
cp .env.example .env
```

Edit `.env` with your local values. Key fields to update:

| Variable | Description | Default (dev) |
|----------|-------------|---------------|
| `DB_PASSWORD` | PostgreSQL password | `dev_password_change_me` |
| `REDIS_PASSWORD` | Redis password | `dev_redis_password` |
| `JWT_PRIVATE_KEY_PATH` | Path to RS256 private key | `./keys/private.pem` |
| `JWT_PUBLIC_KEY_PATH` | Path to RS256 public key | `./keys/public.pem` |
| `OTP_API_KEY` | OTP provider API key | (required for registration) |
| `ANTI_ADDICTION_ENABLED` | Taiwan regulation enforcement | `true` |

For local development, all other defaults in `.env.example` are suitable.

---

## 5. Local Dev: Docker Compose

Start PostgreSQL 15 and Redis 7 using Docker Compose:

```bash
docker compose -f infra/docker-compose.yml up -d
```

Verify services are healthy:

```bash
docker compose -f infra/docker-compose.yml ps
```

Both `postgres` and `redis` should show status `healthy`.

To also start pgAdmin (database web UI at http://localhost:5050):

```bash
docker compose -f infra/docker-compose.yml --profile tools up -d
```

Stop services when done:

```bash
docker compose -f infra/docker-compose.yml down
```

To remove all data volumes (full reset):

```bash
docker compose -f infra/docker-compose.yml down -v
```

---

## 6. Run Database Migrations

Run schema migrations after the database is healthy:

```bash
npm run migrate
```

Verify the migration completed:

```bash
npm run migrate:status
```

To roll back the last migration:

```bash
npm run migrate:rollback
```

---

## 7. Start Development Servers

Open three terminal windows and run each server:

**Terminal 1 — Colyseus Game Server (WebSocket, port 2567):**

```bash
npm run dev:server
```

**Terminal 2 — REST API Server (port 3000):**

```bash
npm run dev:api
```

**Terminal 3 — Frontend Client (port 3001 or Vite default):**

```bash
npm run dev:client
```

Or, if your `package.json` has a combined dev script:

```bash
npm run dev
```

Access the application:

- Frontend: http://localhost:3001
- API health: http://localhost:3000/health
- Game server health: http://localhost:2567/health
- Colyseus monitor (dev only): http://localhost:2567/colyseus

---

## 8. Run Tests

**Unit tests (Jest):**

```bash
npm test
```

**Tests with coverage:**

```bash
npm run test:coverage
```

**End-to-end tests (Playwright):**

Ensure all three dev servers are running, then:

```bash
npm run test:e2e
```

**Watch mode (for TDD):**

```bash
npm run test:watch
```

---

## 9. Minikube Kubernetes Deployment

### 9.1 Start Minikube

```bash
minikube start --cpus=4 --memory=8192 --disk-size=30g
```

Enable required addons:

```bash
minikube addons enable ingress
minikube addons enable metrics-server
```

### 9.2 Point Docker to Minikube's Docker Daemon

This allows you to build images directly into Minikube without pushing to a registry:

```bash
eval $(minikube docker-env)
```

> On Windows (PowerShell): `& minikube -p minikube docker-env | Invoke-Expression`

### 9.3 Build Docker Images

Build all three images into Minikube's Docker:

```bash
docker build -f infra/Dockerfile.server -t sam-gong-server:latest .
docker build -f infra/Dockerfile.api -t sam-gong-api:latest .
docker build -f infra/Dockerfile.client -t sam-gong-client:latest client/
```

### 9.4 Create Namespace and Apply Secrets

```bash
kubectl apply -f infra/k8s/namespace.yaml
```

Create the secret with real values (do NOT commit this):

```bash
kubectl create secret generic sam-gong-secrets \
  --namespace=sam-gong \
  --from-literal=DB_PASSWORD='your_db_password' \
  --from-literal=JWT_PRIVATE_KEY="$(cat keys/private.pem)" \
  --from-literal=JWT_PUBLIC_KEY="$(cat keys/public.pem)" \
  --from-literal=REDIS_PASSWORD='your_redis_password' \
  --from-literal=OTP_API_KEY='your_otp_key'
```

> **Production**: Use Sealed Secrets or External Secrets Operator instead. See `infra/k8s/secret.yaml` for instructions.

### 9.5 Apply All Kubernetes Manifests

Apply manifests in order:

```bash
kubectl apply -f infra/k8s/configmap.yaml
kubectl apply -f infra/k8s/postgres-statefulset.yaml
kubectl apply -f infra/k8s/redis-statefulset.yaml
```

Wait for databases to be ready:

```bash
kubectl wait --namespace=sam-gong \
  --for=condition=ready pod \
  --selector=app=postgres \
  --timeout=120s

kubectl wait --namespace=sam-gong \
  --for=condition=ready pod \
  --selector=app=redis \
  --timeout=60s
```

Apply application manifests:

```bash
kubectl apply -f infra/k8s/deployment-server.yaml
kubectl apply -f infra/k8s/deployment-api.yaml
kubectl apply -f infra/k8s/deployment-client.yaml
kubectl apply -f infra/k8s/service-server.yaml
kubectl apply -f infra/k8s/service-api.yaml
kubectl apply -f infra/k8s/service-client.yaml
kubectl apply -f infra/k8s/ingress.yaml
kubectl apply -f infra/k8s/hpa.yaml
kubectl apply -f infra/k8s/pdb.yaml
kubectl apply -f infra/k8s/networkpolicy.yaml
```

Or apply the entire directory at once:

```bash
kubectl apply -f infra/k8s/
```

### 9.6 Run Database Migrations in Cluster

```bash
kubectl run migrate --rm -it \
  --namespace=sam-gong \
  --image=sam-gong-api:latest \
  --restart=Never \
  --env-from=configmap/sam-gong-config \
  --env-from=secret/sam-gong-secrets \
  -- node dist/migrate.js
```

### 9.7 Get the Minikube IP

```bash
minikube ip
```

Add the IP to your `/etc/hosts` (or `C:\Windows\System32\drivers\etc\hosts`):

```
<minikube-ip>  sam-gong.local
```

Access the app at: http://sam-gong.local

---

## 10. Verify Health and Game Flow

### 10.1 Check Pod Status

```bash
kubectl get pods -n sam-gong
```

All pods should show `Running` with `READY 1/1` (or higher for multi-replica).

### 10.2 Health Checks

```bash
# API health
curl http://sam-gong.local/api/health

# Game server health (via port-forward if ingress not set up)
kubectl port-forward -n sam-gong svc/sam-gong-server-service 2567:2567 &
curl http://localhost:2567/health
```

Expected response:
```json
{"status": "ok", "timestamp": "..."}
```

### 10.3 Game Flow Smoke Test

1. Open http://sam-gong.local in your browser
2. Register a new account (OTP verification required if `ANTI_ADDICTION_ENABLED=true`)
3. Log in and navigate to the lobby
4. Create a new game room
5. Open a second browser tab, log in with a different account, and join the room
6. Verify cards are dealt and game progresses

### 10.4 WebSocket Connectivity Test

```bash
# Using wscat (install: npm install -g wscat)
wscat -c ws://sam-gong.local/colyseus
```

### 10.5 View Logs

```bash
# Game server logs
kubectl logs -n sam-gong -l app=sam-gong-server --tail=100 -f

# API logs
kubectl logs -n sam-gong -l app=sam-gong-api --tail=100 -f

# Database logs
kubectl logs -n sam-gong postgres-0 --tail=50
```

---

## 11. Troubleshooting

### Pods stuck in `Pending`

```bash
kubectl describe pod <pod-name> -n sam-gong
```

Common causes:
- **Insufficient resources**: Increase minikube CPU/memory (`minikube start --cpus=4 --memory=8192`)
- **PVC not bound**: Check `storageClass: fast-ssd` exists or change to `standard` for local dev
- **Image not found**: Ensure you ran `eval $(minikube docker-env)` before building

For local dev, patch StatefulSet storage class:

```bash
# Edit postgres-statefulset.yaml: change storageClassName: fast-ssd → standard
kubectl apply -f infra/k8s/postgres-statefulset.yaml
```

### `CrashLoopBackOff`

```bash
kubectl logs -n sam-gong <pod-name> --previous
```

Common causes:
- Missing environment variables — verify secret was created correctly
- Database not ready — check postgres pod health before deploying app
- Port conflict — ensure no local process is using ports 2567 or 3000

### Database connection refused

```bash
# Test connectivity from inside the cluster
kubectl run pg-test --rm -it \
  --namespace=sam-gong \
  --image=postgres:15-alpine \
  --restart=Never \
  -- psql -h postgres-service -U sam_gong_app -d sam_gong
```

### Redis authentication failure

```bash
kubectl run redis-test --rm -it \
  --namespace=sam-gong \
  --image=redis:7-alpine \
  --restart=Never \
  -- redis-cli -h redis-service -a <your_redis_password> ping
```

### WebSocket 101 upgrade not working

Ensure the ingress addon is enabled and the upgrade annotations are applied:

```bash
kubectl get ingress -n sam-gong -o yaml | grep -A5 "proxy-read-timeout"
```

If annotations are missing, re-apply the ingress manifest:

```bash
kubectl apply -f infra/k8s/ingress.yaml
```

### Minikube reset

To completely reset the Minikube cluster and start fresh:

```bash
minikube delete
minikube start --cpus=4 --memory=8192
```

### Check resource quota usage

```bash
kubectl describe resourcequota sam-gong-quota -n sam-gong
```

### HPA not scaling

```bash
kubectl describe hpa -n sam-gong
```

If metrics are unavailable, ensure `metrics-server` is enabled:

```bash
minikube addons enable metrics-server
```

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `docker compose -f infra/docker-compose.yml up -d` | Start local databases |
| `npm run dev` | Start all dev servers |
| `npm test` | Run unit tests |
| `npm run test:e2e` | Run e2e tests |
| `minikube start` | Start local k8s cluster |
| `eval $(minikube docker-env)` | Point Docker to Minikube |
| `kubectl apply -f infra/k8s/` | Deploy to Minikube |
| `kubectl get pods -n sam-gong` | Check pod status |
| `minikube tunnel` | Expose LoadBalancer services locally |
| `minikube dashboard` | Open k8s dashboard in browser |
