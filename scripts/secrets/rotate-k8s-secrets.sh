#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${NAMESPACE:-sam-gong}"
SECRETS_DIR="${SECRETS_DIR:-./secrets}"

# Validate required files/vars
check_required() {
  local missing=0

  [[ -z "${DB_PASSWORD:-}" ]] && { echo "❌ DB_PASSWORD is required"; missing=1; }
  [[ -z "${REDIS_PASSWORD:-}" ]] && { echo "❌ REDIS_PASSWORD is required"; missing=1; }
  [[ -z "${OTP_API_KEY:-}" ]] && { echo "❌ OTP_API_KEY is required"; missing=1; }

  [[ ! -f "$SECRETS_DIR/jwt_private.pem" ]] && {
    echo "❌ $SECRETS_DIR/jwt_private.pem not found. Run generate-jwt-keys.sh first."
    missing=1
  }
  [[ ! -f "$SECRETS_DIR/jwt_public.pem" ]] && {
    echo "❌ $SECRETS_DIR/jwt_public.pem not found. Run generate-jwt-keys.sh first."
    missing=1
  }

  [[ $missing -ne 0 ]] && exit 1
}

check_required

echo "🔐 Applying secrets to namespace: $NAMESPACE..."

# Create k8s secret (dry-run + apply for idempotency — avoids immutable field errors)
kubectl create secret generic sam-gong-secrets \
  --namespace="$NAMESPACE" \
  --from-literal=DB_PASSWORD="${DB_PASSWORD:?DB_PASSWORD required}" \
  --from-literal=REDIS_PASSWORD="${REDIS_PASSWORD:?REDIS_PASSWORD required}" \
  --from-literal=OTP_API_KEY="${OTP_API_KEY:?OTP_API_KEY required}" \
  --from-file=jwt-private-key="${SECRETS_DIR}/jwt_private.pem" \
  --from-file=jwt-public-key="${SECRETS_DIR}/jwt_public.pem" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "✅ Secrets applied to namespace: $NAMESPACE"
echo ""
echo "Verify with: kubectl get secret sam-gong-secrets -n $NAMESPACE"
