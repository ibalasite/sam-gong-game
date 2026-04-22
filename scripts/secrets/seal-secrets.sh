#!/usr/bin/env bash
# Seal secrets using kubeseal (Bitnami Sealed Secrets)
# Usage: NAMESPACE=sam-gong ./scripts/secrets/seal-secrets.sh

set -euo pipefail

NAMESPACE="${NAMESPACE:-sam-gong}"
CERT_URL="${SEALED_SECRETS_CERT:-}"

# Check kubeseal is available
command -v kubeseal &>/dev/null || {
  echo "❌ kubeseal not found. Install: https://github.com/bitnami-labs/sealed-secrets#installation"
  exit 1
}

# Check source secret template exists
[[ ! -f "infra/k8s/secret.yaml" ]] && {
  echo "❌ infra/k8s/secret.yaml not found. Run from project root."
  exit 1
}

# Fetch cert from cluster if not provided
if [[ -z "$CERT_URL" ]]; then
  echo "Fetching Sealed Secrets certificate from cluster..."
  kubeseal --fetch-cert --controller-namespace kube-system \
    --controller-name sealed-secrets > /tmp/sealed-secrets.crt
  CERT="--cert /tmp/sealed-secrets.crt"
else
  CERT="--cert $CERT_URL"
fi

# Seal the template secret
kubeseal $CERT \
  --namespace "$NAMESPACE" \
  --format yaml \
  < infra/k8s/secret.yaml \
  > infra/k8s/sealed-secret.yaml

echo "✅ Sealed secret written to infra/k8s/sealed-secret.yaml"
echo "   This file is safe to commit to git."
echo ""
echo "Apply with: kubectl apply -f infra/k8s/sealed-secret.yaml"
