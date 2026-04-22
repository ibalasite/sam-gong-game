#!/usr/bin/env bash
# ==========================================================
#  Sam Gong — Local k8s Port-Forward 一鍵開啟
#  用法：bash infra/k8s/local/portforward.sh
#  按 Ctrl+C 結束所有 port-forward
# ==========================================================
set -euo pipefail

NS="sam-gong-local"

_GREEN="\033[32m"
_YELLOW="\033[33m"
_CYAN="\033[36m"
_RESET="\033[0m"

echo ""
echo -e "${_CYAN}╔════════════════════════════════════════════════╗${_RESET}"
echo -e "${_CYAN}║   Sam Gong — Local k8s 測試入口啟動中          ║${_RESET}"
echo -e "${_CYAN}╚════════════════════════════════════════════════╝${_RESET}"
echo ""

# 確認 namespace 存在
if ! kubectl get namespace "$NS" &>/dev/null; then
  echo "❌ Namespace $NS 不存在。請先執行："
  echo "   bash scripts/local-k8s-deploy.sh"
  exit 1
fi

# 等待 pods ready
echo "⏳ 等待所有 Pod 就緒..."
kubectl wait --for=condition=ready pod \
  -l "app in (sam-gong-server,sam-gong-api,sam-gong-client,postgres,redis)" \
  -n "$NS" --timeout=120s 2>/dev/null || {
    echo ""
    echo "⚠️  部分 Pod 尚未就緒，強制啟動 port-forward（可能需要稍等）"
    echo "   查看狀態：kubectl get pods -n $NS"
  }

echo ""
echo -e "${_GREEN}✅ 啟動 Port-Forward...${_RESET}"
echo ""

# 清理函式
cleanup() {
  echo ""
  echo "🛑 關閉所有 port-forward"
  kill $(jobs -p) 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM

# ── Port Forward ──────────────────────────────────────────
kubectl port-forward svc/sam-gong-client-service   8080:80   -n "$NS" &>/dev/null &
kubectl port-forward svc/sam-gong-api-service      3000:3000 -n "$NS" &>/dev/null &
kubectl port-forward svc/sam-gong-server-service   2567:2567 -n "$NS" &>/dev/null &
kubectl port-forward svc/postgres-service          5432:5432 -n "$NS" &>/dev/null &
kubectl port-forward svc/redis-service             6379:6379 -n "$NS" &>/dev/null &

sleep 2  # 等待 port-forward 建立

echo ""
echo -e "${_CYAN}╔════════════════════════════════════════════════════════╗${_RESET}"
echo -e "${_CYAN}║              🎴 本機測試入口清單                       ║${_RESET}"
echo -e "${_CYAN}╠════════════════════════════════════════════════════════╣${_RESET}"
echo -e "${_CYAN}║${_RESET}  前端頁面    ${_GREEN}http://localhost:8080${_RESET}                   ${_CYAN}║${_RESET}"
echo -e "${_CYAN}║${_RESET}  REST API    ${_GREEN}http://localhost:3000/api/v1/health${_RESET}     ${_CYAN}║${_RESET}"
echo -e "${_CYAN}║${_RESET}  Colyseus WS ${_GREEN}ws://localhost:2567${_RESET}                     ${_CYAN}║${_RESET}"
echo -e "${_CYAN}║${_RESET}  Colyseus 監 ${_GREEN}http://localhost:2567/colyseus${_RESET}          ${_CYAN}║${_RESET}"
echo -e "${_CYAN}║${_RESET}  PostgreSQL  ${_YELLOW}localhost:5432${_RESET}  db=sam_gong             ${_CYAN}║${_RESET}"
echo -e "${_CYAN}║${_RESET}             ${_YELLOW}user=sam_gong_app  pass=dev_password...${_RESET}  ${_CYAN}║${_RESET}"
echo -e "${_CYAN}║${_RESET}  Redis       ${_YELLOW}localhost:6379${_RESET}  pass=dev_redis_password ${_CYAN}║${_RESET}"
echo -e "${_CYAN}╠════════════════════════════════════════════════════════╣${_RESET}"
echo -e "${_CYAN}║${_RESET}  文件網站    ${_GREEN}file://$(pwd)/docs/site/index.html${_RESET}"
echo -e "${_CYAN}╠════════════════════════════════════════════════════════╣${_RESET}"
echo -e "${_CYAN}║${_RESET}  快速測試：                                             ${_CYAN}║${_RESET}"
echo -e "${_CYAN}║${_RESET}    curl http://localhost:3000/api/v1/health             ${_CYAN}║${_RESET}"
echo -e "${_CYAN}║${_RESET}    curl http://localhost:2567/health                    ${_CYAN}║${_RESET}"
echo -e "${_CYAN}╚════════════════════════════════════════════════════════╝${_RESET}"
echo ""
echo "按 Ctrl+C 關閉所有 port-forward"
echo ""

# 保持前景執行直到 Ctrl+C
wait
