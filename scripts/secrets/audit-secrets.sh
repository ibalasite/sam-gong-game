#!/usr/bin/env bash
# Check for accidentally committed secrets/private keys

set -euo pipefail

echo "🔍 Scanning for accidentally committed secrets..."

FOUND=0

# Check for PEM files in git history
if git log --all --full-history -- "*.pem" 2>/dev/null | grep -q "commit"; then
  echo "❌ PEM files found in git history!"
  FOUND=1
fi

# Check for .env files (not .env.example)
if git ls-files | grep -E "^\.env$|^\.env\.[^e]" | grep -v ".env.example"; then
  echo "❌ .env files tracked by git!"
  FOUND=1
fi

# Check for hardcoded patterns using git-secrets style
PATTERNS=(
  "password\s*=\s*['\"][^'\"]{8,}"
  "secret\s*=\s*['\"][^'\"]{8,}"
  "api_key\s*=\s*['\"][^'\"]{8,}"
  "private_key"
  "BEGIN RSA PRIVATE KEY"
  "BEGIN PRIVATE KEY"
)

for pattern in "${PATTERNS[@]}"; do
  if git diff HEAD --cached | grep -iE "$pattern" 2>/dev/null; then
    echo "❌ Potential secret pattern found: $pattern"
    FOUND=1
  fi
done

if [[ $FOUND -eq 0 ]]; then
  echo "✅ No secrets detected in repository."
else
  echo ""
  echo "⚠️  Please review and remove secrets before committing."
  echo "   Use 'git filter-repo' or BFG Repo Cleaner to purge history if needed."
  exit 1
fi
