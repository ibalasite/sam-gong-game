#!/usr/bin/env bash
# Convert .env file values to k8s secret
# Usage: ENV_FILE=.env.staging NAMESPACE=sam-gong-staging ./scripts/secrets/env-to-k8s.sh

set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"
NAMESPACE="${NAMESPACE:-sam-gong}"
SECRET_NAME="${SECRET_NAME:-sam-gong-secrets}"

[[ ! -f "$ENV_FILE" ]] && { echo "❌ $ENV_FILE not found"; exit 1; }

echo "📦 Loading secrets from $ENV_FILE into namespace $NAMESPACE..."

# Build --from-literal args from .env file (skip comments and empty lines)
ARGS=()
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^#.*$ ]] && continue
  [[ -z "$line" ]] && continue
  ARGS+=("--from-literal=$line")
done < "$ENV_FILE"

[[ ${#ARGS[@]} -eq 0 ]] && { echo "❌ No key=value pairs found in $ENV_FILE"; exit 1; }

kubectl create secret generic "$SECRET_NAME" \
  --namespace="$NAMESPACE" \
  "${ARGS[@]}" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "✅ k8s secret '$SECRET_NAME' created/updated in namespace '$NAMESPACE'"
echo ""
echo "Verify with: kubectl get secret $SECRET_NAME -n $NAMESPACE -o yaml"
