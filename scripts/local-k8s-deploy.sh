#!/usr/bin/env bash
# ==========================================================
#  Sam Gong — 一鍵本機 k8s 部署腳本
#  支援：minikube | kind | Docker Desktop k8s
#  用法：bash scripts/local-k8s-deploy.sh [--reset]
#
#  --reset：刪除 namespace 並重新部署
# ==========================================================
set -euo pipefail

_GREEN="\033[32m"; _YELLOW="\033[33m"; _RED="\033[31m"
_CYAN="\033[36m"; _BOLD="\033[1m"; _RESET="\033[0m"

NS="sam-gong-local"
K8S_LOCAL_DIR="infra/k8s/local"
RESET=false

# ── 引數解析 ──────────────────────────────────────────────
for arg in "$@"; do
  [[ "$arg" == "--reset" ]] && RESET=true
done

step() { echo -e "\n${_CYAN}${_BOLD}[$1]${_RESET} $2"; }
ok()   { echo -e "  ${_GREEN}✅ $1${_RESET}"; }
warn() { echo -e "  ${_YELLOW}⚠️  $1${_RESET}"; }
err()  { echo -e "  ${_RED}❌ $1${_RESET}"; exit 1; }

echo ""
echo -e "${_CYAN}${_BOLD}╔══════════════════════════════════════════════════════╗${_RESET}"
echo -e "${_CYAN}${_BOLD}║   Sam Gong — Local k8s 一鍵部署                      ║${_RESET}"
echo -e "${_CYAN}${_BOLD}╚══════════════════════════════════════════════════════╝${_RESET}"

# ── Step 1：偵測 k8s 環境 ─────────────────────────────────
step "1/7" "偵測 k8s 環境"
if ! kubectl cluster-info &>/dev/null; then
  err "找不到可用的 k8s cluster！請先啟動以下其中一個：
    A) minikube start --cpus=4 --memory=4096
    B) kind create cluster --name sam-gong
    C) Docker Desktop → Settings → Kubernetes → Enable"
fi

CONTEXT=$(kubectl config current-context 2>/dev/null || echo "unknown")
ok "k8s cluster 正常 (context: $CONTEXT)"

# 偵測是否為 minikube
IS_MINIKUBE=false
if kubectl config current-context 2>/dev/null | grep -q "minikube"; then
  IS_MINIKUBE=true
  ok "偵測到 minikube，稍後使用 minikube docker-env"
fi

# ── Step 2：Reset（可選）─────────────────────────────────
if $RESET; then
  step "2/7" "Reset：刪除舊的 namespace $NS"
  kubectl delete namespace "$NS" --ignore-not-found=true
  ok "舊 namespace 已刪除"
  sleep 5
else
  step "2/7" "跳過 Reset（使用 --reset 可清空重建）"
fi

# ── Step 3：設定 Docker 環境（minikube only）──────────────
step "3/7" "設定 Docker build 環境"
if $IS_MINIKUBE; then
  eval "$(minikube docker-env)"
  ok "已切換至 minikube 內建 Docker daemon"
  warn "所有 docker build 指令都在 minikube 內執行（imagePullPolicy: Never 才有效）"
else
  ok "使用本地 Docker daemon（Docker Desktop k8s / kind）"
fi

# ── Step 4：Build Docker Images ───────────────────────────
step "4/7" "Build Docker 映像檔（3 個）"

echo "  📦 Building sam-gong-server:local ..."
docker build -f infra/Dockerfile.server -t sam-gong-server:local . -q && ok "sam-gong-server:local"

echo "  📦 Building sam-gong-api:local ..."
docker build -f infra/Dockerfile.api    -t sam-gong-api:local    . -q && ok "sam-gong-api:local"

echo "  📦 Building sam-gong-client:local ..."
docker build -f infra/Dockerfile.client -t sam-gong-client:local . -q && ok "sam-gong-client:local"

# kind 需要額外 load image
if kubectl config current-context 2>/dev/null | grep -q "kind"; then
  echo "  ☁️  Loading images into kind cluster..."
  CLUSTER_NAME=$(kubectl config current-context | sed 's/kind-//')
  kind load docker-image sam-gong-server:local --name "$CLUSTER_NAME"
  kind load docker-image sam-gong-api:local    --name "$CLUSTER_NAME"
  kind load docker-image sam-gong-client:local --name "$CLUSTER_NAME"
  ok "Images loaded into kind"
fi

# ── Step 5：Apply k8s manifests ───────────────────────────
step "5/7" "Apply k8s manifests → namespace: $NS"

kubectl apply -f "$K8S_LOCAL_DIR/namespace-local.yaml"
ok "Namespace: $NS"

kubectl apply -f "$K8S_LOCAL_DIR/secret-local.yaml"
warn "使用開發用假 secret（JWT keys 是 placeholder，需替換才能真正啟動 auth）"
warn "執行 bash scripts/secrets/generate-jwt-keys.sh 生成真實 JWT keys"

kubectl apply -f "$K8S_LOCAL_DIR/configmap-local.yaml"
ok "ConfigMap"

kubectl apply -f "$K8S_LOCAL_DIR/postgres-local.yaml"
ok "PostgreSQL StatefulSet"

kubectl apply -f "$K8S_LOCAL_DIR/redis-local.yaml"
ok "Redis StatefulSet"

kubectl apply -f "$K8S_LOCAL_DIR/deployments-local.yaml"
ok "Deployments + Services（server / api / client）"

# ── Step 6：等待 Pods Ready ───────────────────────────────
step "6/7" "等待 Pods 就緒（最多 3 分鐘）"

echo "  ⏳ 等待 PostgreSQL..."
kubectl wait --for=condition=ready pod -l app=postgres -n "$NS" --timeout=120s && ok "PostgreSQL ready"

echo "  ⏳ 等待 Redis..."
kubectl wait --for=condition=ready pod -l app=redis    -n "$NS" --timeout=60s  && ok "Redis ready"

echo "  ⏳ 等待 API server..."
kubectl wait --for=condition=ready pod -l app=sam-gong-api    -n "$NS" --timeout=120s && ok "API server ready" || warn "API server 尚未 ready（可能因 JWT placeholder 啟動失敗，屬正常）"

echo "  ⏳ 等待 Game server..."
kubectl wait --for=condition=ready pod -l app=sam-gong-server -n "$NS" --timeout=120s && ok "Game server ready" || warn "Game server 尚未 ready（同上）"

echo "  ⏳ 等待 Client..."
kubectl wait --for=condition=ready pod -l app=sam-gong-client -n "$NS" --timeout=60s  && ok "Client ready"

# ── Step 7：顯示狀態 & 入口 ──────────────────────────────
step "7/7" "部署完成！"
echo ""
kubectl get pods,svc -n "$NS" 2>/dev/null
echo ""

echo -e "${_CYAN}${_BOLD}╔════════════════════════════════════════════════════════════╗${_RESET}"
echo -e "${_CYAN}${_BOLD}║           ✅ 部署完成！啟動 Port-Forward：                  ║${_RESET}"
echo -e "${_CYAN}${_BOLD}╠════════════════════════════════════════════════════════════╣${_RESET}"
echo -e "${_CYAN}${_BOLD}║${_RESET}                                                             ${_CYAN}${_BOLD}║${_RESET}"
echo -e "${_CYAN}${_BOLD}║${_RESET}  ${_GREEN}bash infra/k8s/local/portforward.sh${_RESET}                        ${_CYAN}${_BOLD}║${_RESET}"
echo -e "${_CYAN}${_BOLD}║${_RESET}                                                             ${_CYAN}${_BOLD}║${_RESET}"
echo -e "${_CYAN}${_BOLD}║${_RESET}  啟動後存取：                                                ${_CYAN}${_BOLD}║${_RESET}"
echo -e "${_CYAN}${_BOLD}║${_RESET}    前端    → ${_GREEN}http://localhost:8080${_RESET}                          ${_CYAN}${_BOLD}║${_RESET}"
echo -e "${_CYAN}${_BOLD}║${_RESET}    REST API→ ${_GREEN}http://localhost:3000/api/v1/health${_RESET}            ${_CYAN}${_BOLD}║${_RESET}"
echo -e "${_CYAN}${_BOLD}║${_RESET}    WS      → ${_GREEN}ws://localhost:2567${_RESET}                            ${_CYAN}${_BOLD}║${_RESET}"
echo -e "${_CYAN}${_BOLD}║${_RESET}    Colyseus → ${_GREEN}http://localhost:2567/colyseus${_RESET}  (Monitor)     ${_CYAN}${_BOLD}║${_RESET}"
echo -e "${_CYAN}${_BOLD}╚════════════════════════════════════════════════════════════╝${_RESET}"
echo ""
echo -e "  ${_YELLOW}⚠️  JWT keys 是 placeholder，需先執行：${_RESET}"
echo "     bash scripts/secrets/generate-jwt-keys.sh"
echo "     然後重新 apply secret：kubectl apply -f infra/k8s/local/secret-local.yaml"
echo ""
