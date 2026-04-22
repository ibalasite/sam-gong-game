#!/usr/bin/env bash
# ==========================================================
#  Sam Gong — 本機 API / WS 快速測試腳本
#  前置條件：portforward.sh 正在執行中
#  用法：bash scripts/local-test.sh
# ==========================================================
set -euo pipefail

API="http://localhost:3000"
WS_HOST="localhost:2567"
_GREEN="\033[32m"; _RED="\033[31m"; _YELLOW="\033[33m"
_CYAN="\033[36m"; _RESET="\033[0m"

PASS=0; FAIL=0

ok()   { echo -e "  ${_GREEN}✅ PASS${_RESET} — $1"; ((PASS++)); }
fail() { echo -e "  ${_RED}❌ FAIL${_RESET} — $1: $2"; ((FAIL++)); }
head() { echo -e "\n${_CYAN}── $1 ──────────────────────────────────${_RESET}"; }

echo ""
echo -e "${_CYAN}╔══════════════════════════════════════════╗${_RESET}"
echo -e "${_CYAN}║  Sam Gong — 本機 API 冒煙測試            ║${_RESET}"
echo -e "${_CYAN}╚══════════════════════════════════════════╝${_RESET}"

# ── REST API Health ───────────────────────────────────────
head "REST API Health"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/v1/health" 2>/dev/null || echo "000")
if [[ "$STATUS" == "200" ]]; then
  ok "GET /api/v1/health → 200"
else
  fail "GET /api/v1/health" "HTTP $STATUS（確認 portforward.sh 在執行）"
fi

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:2567/health" 2>/dev/null || echo "000")
if [[ "$STATUS" == "200" ]]; then
  ok "GET :2567/health (Colyseus) → 200"
else
  fail "GET :2567/health" "HTTP $STATUS"
fi

# ── Auth Endpoints ────────────────────────────────────────
head "Auth API"

# 測試 register（預期 201 或 400，不能是 500）
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+886912345678","otp":"123456","nickname":"TestPlayer","birth_date":"2000-01-01"}' 2>/dev/null || echo -e "\n000")
CODE=$(echo "$RESP" | tail -1)
if [[ "$CODE" =~ ^(200|201|400|422|409)$ ]]; then
  ok "POST /auth/register → $CODE（server responding）"
else
  fail "POST /auth/register" "HTTP $CODE（server error or unreachable）"
fi

# 測試 login with invalid token → 401
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+886912345678","otp":"000000"}' 2>/dev/null || echo "000")
if [[ "$STATUS" =~ ^(200|400|401|422)$ ]]; then
  ok "POST /auth/login → $STATUS（server responding）"
else
  fail "POST /auth/login" "HTTP $STATUS"
fi

# ── Protected Endpoint → 401 without token ────────────────
head "Auth Guard"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/v1/player/me" 2>/dev/null || echo "000")
if [[ "$STATUS" == "401" ]]; then
  ok "GET /player/me (no token) → 401 ✓"
else
  fail "GET /player/me (no token)" "Expected 401, got $STATUS"
fi

# ── Colyseus Rooms ────────────────────────────────────────
head "Colyseus WS Server"

ROOMS=$(curl -s "http://${WS_HOST}/colyseus/rooms" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'rooms: {len(d)}')" 2>/dev/null || echo "parse error")
if [[ "$ROOMS" != "parse error" ]]; then
  ok "GET /colyseus/rooms → $ROOMS"
else
  warn() { echo -e "  ${_YELLOW}⚠️  $1${_RESET}"; }
  warn "Colyseus monitor /rooms endpoint — JWT 問題時可能 403"
fi

# ── Database Connectivity （indirect via API）─────────────
head "Database (via API)"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/v1/health/db" 2>/dev/null || echo "000")
if [[ "$STATUS" == "200" ]]; then
  ok "GET /health/db → 200（DB connected）"
elif [[ "$STATUS" == "404" ]]; then
  echo -e "  ${_YELLOW}⚠️  /health/db 未實作，跳過${_RESET}"
else
  fail "GET /health/db" "HTTP $STATUS"
fi

# ── 結果摘要 ──────────────────────────────────────────────
echo ""
echo -e "${_CYAN}╔══════════════════════════════════════════╗${_RESET}"
echo -e "${_CYAN}║  測試結果                                 ║${_RESET}"
echo -e "${_CYAN}╠══════════════════════════════════════════╣${_RESET}"
TOTAL=$((PASS+FAIL))
if [[ $FAIL -eq 0 ]]; then
  echo -e "${_CYAN}║${_RESET}  ${_GREEN}✅ ALL PASS：$PASS / $TOTAL${_RESET}                      ${_CYAN}║${_RESET}"
else
  echo -e "${_CYAN}║${_RESET}  ${_RED}❌ FAIL：$FAIL / $TOTAL${_RESET}  PASS：$PASS / $TOTAL        ${_CYAN}║${_RESET}"
fi
echo -e "${_CYAN}╚══════════════════════════════════════════╝${_RESET}"
echo ""
echo "手動測試入口："
echo "  前端：     http://localhost:8080"
echo "  API Docs:  http://localhost:8080/docs  （若有 Swagger）"
echo "  Colyseus:  http://localhost:2567/colyseus  （WebSocket Monitor）"
echo "  pgAdmin:   docker compose --profile tools up -d  → http://localhost:5050"
echo ""

[[ $FAIL -gt 0 ]] && exit 1 || exit 0
