#!/usr/bin/env bash
# Set GitHub Actions secrets using gh CLI
# Usage: GITHUB_REPO=owner/repo ./scripts/secrets/setup-github-secrets.sh

set -euo pipefail

REPO="${GITHUB_REPO:?GITHUB_REPO required (e.g. myorg/sam-gong-game)}"
SECRETS_DIR="${SECRETS_DIR:-./secrets}"

check_gh_auth() {
  gh auth status 2>/dev/null || { echo "❌ Not authenticated. Run: gh auth login"; exit 1; }
}

set_secret() {
  local name="$1" value="$2"
  echo "$value" | gh secret set "$name" --repo "$REPO"
  echo "  ✅ $name"
}

check_gh_auth

echo "🔐 Setting GitHub Actions secrets for $REPO..."

# k8s configs (base64-encoded kubeconfig files)
[[ -f "$SECRETS_DIR/kubeconfig-staging.yaml" ]] && \
  set_secret "KUBE_CONFIG_STAGING" "$(base64 -w0 < "$SECRETS_DIR/kubeconfig-staging.yaml")"

[[ -f "$SECRETS_DIR/kubeconfig-prod.yaml" ]] && \
  set_secret "KUBE_CONFIG_PRODUCTION" "$(base64 -w0 < "$SECRETS_DIR/kubeconfig-prod.yaml")"

# App secrets
[[ -n "${DB_PASSWORD:-}" ]] && set_secret "DB_PASSWORD" "$DB_PASSWORD"
[[ -n "${REDIS_PASSWORD:-}" ]] && set_secret "REDIS_PASSWORD" "$REDIS_PASSWORD"
[[ -n "${OTP_API_KEY:-}" ]] && set_secret "OTP_API_KEY" "$OTP_API_KEY"
[[ -n "${SLACK_WEBHOOK_URL:-}" ]] && set_secret "SLACK_WEBHOOK_URL" "$SLACK_WEBHOOK_URL"

# JWT keys
[[ -f "$SECRETS_DIR/jwt_private.pem" ]] && \
  set_secret "JWT_PRIVATE_KEY" "$(cat "$SECRETS_DIR/jwt_private.pem")"
[[ -f "$SECRETS_DIR/jwt_public.pem" ]] && \
  set_secret "JWT_PUBLIC_KEY" "$(cat "$SECRETS_DIR/jwt_public.pem")"

echo ""
echo "✅ All secrets configured. Run 'gh secret list --repo $REPO' to verify."
