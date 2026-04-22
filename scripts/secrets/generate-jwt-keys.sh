#!/usr/bin/env bash
set -euo pipefail

OUTPUT_DIR="${1:-./secrets}"
mkdir -p "$OUTPUT_DIR"

# Generate RSA 4096-bit private key
openssl genrsa -out "$OUTPUT_DIR/jwt_private.pem" 4096
# Extract public key
openssl rsa -in "$OUTPUT_DIR/jwt_private.pem" -pubout -out "$OUTPUT_DIR/jwt_public.pem"

echo "✅ JWT keys generated:"
echo "  Private: $OUTPUT_DIR/jwt_private.pem"
echo "  Public:  $OUTPUT_DIR/jwt_public.pem"
echo ""
echo "⚠️  Add secrets/ to .gitignore — NEVER commit private keys!"
echo ""
echo "Next step: run scripts/secrets/rotate-k8s-secrets.sh to apply to cluster"
