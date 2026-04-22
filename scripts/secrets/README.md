# Secrets Management — Sam Gong Game

## Overview

This project uses a **never-in-git** secrets strategy:

| Secret type | Dev | Staging | Production |
|---|---|---|---|
| App env vars | `.env` (local only) | k8s Secret via `env-to-k8s.sh` | k8s Secret via `rotate-k8s-secrets.sh` |
| JWT keys | `secrets/` dir (local only) | k8s Secret (from file) | k8s Secret (from file) |
| CI/CD secrets | — | GitHub Actions secrets | GitHub Actions secrets |
| k8s Secret manifest | — | Sealed Secret (safe to git) | Sealed Secret (safe to git) |

**Rule**: `secrets/`, `*.pem`, and `.env` files are in `.gitignore` and must never be committed. `infra/k8s/sealed-secret.yaml` (encrypted by kubeseal) IS safe to commit.

---

## Scripts

| Script | Purpose |
|---|---|
| `generate-jwt-keys.sh` | Generate RSA 4096-bit keypair for JWT RS256 signing |
| `rotate-k8s-secrets.sh` | Apply/update k8s Secret from env vars + PEM files |
| `seal-secrets.sh` | Seal `infra/k8s/secret.yaml` with kubeseal for git storage |
| `env-to-k8s.sh` | Convert a `.env` file into a k8s Secret |
| `setup-github-secrets.sh` | Populate GitHub Actions secrets via `gh` CLI |
| `audit-secrets.sh` | Scan for accidentally committed secrets (used as pre-commit hook) |

---

## Step-by-Step: Local Dev → Staging → Production

### 1. Local Development

```bash
# Generate JWT keypair (one-time, or on rotation)
./scripts/secrets/generate-jwt-keys.sh ./secrets

# Create .env from example
cp .env.example .env
# Fill in DB_PASSWORD, REDIS_PASSWORD, OTP_API_KEY in .env

# Start services (keys loaded via volume mount or env)
docker compose up
```

### 2. Staging Deployment

```bash
# Set env vars
export DB_PASSWORD="..."
export REDIS_PASSWORD="..."
export OTP_API_KEY="..."
export NAMESPACE="sam-gong-staging"
export SECRETS_DIR="./secrets"

# Apply to cluster
./scripts/secrets/rotate-k8s-secrets.sh

# OR: use .env.staging file
ENV_FILE=.env.staging NAMESPACE=sam-gong-staging ./scripts/secrets/env-to-k8s.sh
```

### 3. Production Deployment

```bash
# Same as staging with production namespace and values
export NAMESPACE="sam-gong"
./scripts/secrets/rotate-k8s-secrets.sh
```

### 4. GitHub Actions CI/CD

```bash
# Set all GitHub Actions secrets at once
export GITHUB_REPO="myorg/sam-gong-game"
export DB_PASSWORD="..."
export REDIS_PASSWORD="..."
export OTP_API_KEY="..."
./scripts/secrets/setup-github-secrets.sh
```

### 5. Sealed Secrets (GitOps)

If using GitOps (ArgoCD / Flux), seal secrets so they can be stored in git:

```bash
# Requires kubeseal + Sealed Secrets controller in cluster
NAMESPACE=sam-gong ./scripts/secrets/seal-secrets.sh

# The output infra/k8s/sealed-secret.yaml is safe to commit
git add infra/k8s/sealed-secret.yaml
git commit -m "chore: update sealed secrets"
```

---

## Key Rotation Procedure

### Regular JWT Key Rotation

```bash
# 1. Generate new keys
./scripts/secrets/generate-jwt-keys.sh ./secrets

# 2. Apply to cluster (zero-downtime: keep old key for token validation briefly)
./scripts/secrets/rotate-k8s-secrets.sh

# 3. Rolling restart to pick up new key
kubectl rollout restart deployment/sam-gong-api -n sam-gong

# 4. Verify new pods are healthy
kubectl rollout status deployment/sam-gong-api -n sam-gong
```

### Database / Redis Password Rotation

```bash
# 1. Update the password in your password manager
# 2. Update the database/Redis instance password
# 3. Re-run rotate-k8s-secrets.sh with the new value
DB_PASSWORD="<new-password>" ./scripts/secrets/rotate-k8s-secrets.sh

# 4. Rolling restart
kubectl rollout restart deployment/sam-gong-api -n sam-gong
```

---

## Emergency Rotation (JWT Key Compromise)

If a private key is suspected to be compromised:

```bash
# 1. Immediately generate new keys
./scripts/secrets/generate-jwt-keys.sh ./secrets

# 2. Apply new keys to ALL environments
NAMESPACE=sam-gong ./scripts/secrets/rotate-k8s-secrets.sh
NAMESPACE=sam-gong-staging ./scripts/secrets/rotate-k8s-secrets.sh

# 3. Force restart ALL API pods immediately (invalidates all existing tokens)
kubectl rollout restart deployment/sam-gong-api -n sam-gong
kubectl rollout restart deployment/sam-gong-api -n sam-gong-staging

# 4. Notify users to re-login (all sessions invalidated)
# 5. Audit logs for suspicious activity during the compromise window
# 6. Rotate GitHub Actions secrets too
./scripts/secrets/setup-github-secrets.sh

# 7. If key was in git history, purge it:
# git filter-repo --path secrets/ --invert-paths
# OR: use BFG Repo Cleaner
```

---

## Security Checklist

- [ ] `secrets/` directory is in `.gitignore`
- [ ] `*.pem` files are in `.gitignore`
- [ ] `.env` files are in `.gitignore` (`.env.example` is allowed)
- [ ] Pre-commit hook is enabled: `git config core.hooksPath .githooks`
- [ ] JWT private key is RSA 4096-bit (or ES256 with P-384 curve)
- [ ] Secrets are rotated at least every 90 days
- [ ] GitHub Actions secrets are set (not hardcoded in workflow YAML)
- [ ] k8s Secrets are not logged (`kubectl get secret ... -o yaml` shows base64, keep offline)
- [ ] Sealed Secrets controller is deployed and cert is backed up
- [ ] Emergency rotation procedure is documented and tested

---

## Pre-Commit Hook

The `audit-secrets.sh` script runs automatically before each commit when the hook is enabled.

```bash
# Enable the hook (one-time per developer)
git config core.hooksPath .githooks
```

The hook checks for:
- PEM files in git history
- `.env` files tracked by git
- Common secret patterns in staged changes (passwords, API keys, private key headers)
