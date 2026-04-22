#!/bin/bash
# =============================================================================
# db_failover_test.sh — DB Failover 測試（NFR-18：failover ≤5min）
#
# 目的：模擬 PostgreSQL Primary 故障，驗證系統能在 5 分鐘內自動切換至
#       Replica，並恢復正常服務。
#
# 測試流程：
#   1. 確認環境（Docker / 原生 PostgreSQL）
#   2. 開始持續監測 API 健康（背景 loop）
#   3. 模擬 PostgreSQL Primary 故障（pause Docker container 或 kill process）
#   4. 記錄服務不可用開始時間
#   5. 等待並監測服務恢復
#   6. 計算 failover 時間，驗證 ≤5min（300s）
#   7. 輸出測試報告
#
# 環境需求：
#   - bash 4.x+
#   - curl
#   - docker（若使用 Docker 模式）或 pg_ctl（若使用原生 PostgreSQL 模式）
#   - jq（選用，用於解析 JSON 回應）
#
# 執行方式：
#   chmod +x tests/performance/db_failover_test.sh
#   ./tests/performance/db_failover_test.sh
#
#   # 使用 Docker 模式（預設）
#   DB_MODE=docker ./tests/performance/db_failover_test.sh
#
#   # 使用原生 PostgreSQL 模式
#   DB_MODE=native PG_PID=$(cat /var/run/postgresql/pg_primary.pid) ./tests/performance/db_failover_test.sh
#
# 環境變數：
#   BASE_URL         — API 健康檢查 URL（預設：http://localhost:3000）
#   DB_MODE          — 故障模式：docker | native（預設：docker）
#   PG_CONTAINER     — PostgreSQL Primary Docker container 名稱（預設：postgres-primary）
#   PG_PID           — PostgreSQL Primary PID（native 模式使用）
#   MAX_FAILOVER_SEC — NFR-18 目標：最大 failover 時間秒數（預設：300）
#   HEALTH_INTERVAL  — 健康檢查間隔秒數（預設：5）
#   TIMEOUT_SEC      — 等待恢復的最大時間（預設：360）
# =============================================================================

set -euo pipefail

# ──── 設定 ────
BASE_URL="${BASE_URL:-http://localhost:3000}"
DB_MODE="${DB_MODE:-docker}"
PG_CONTAINER="${PG_CONTAINER:-postgres-primary}"
MAX_FAILOVER_SEC="${MAX_FAILOVER_SEC:-300}"
HEALTH_INTERVAL="${HEALTH_INTERVAL:-5}"
TIMEOUT_SEC="${TIMEOUT_SEC:-360}"

# 輸出目錄
REPORT_DIR="tests/performance/reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="${REPORT_DIR}/db_failover_${TIMESTAMP}.txt"
HEALTH_LOG="${REPORT_DIR}/health_log_${TIMESTAMP}.csv"

# 顏色輸出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ──── 輔助函數 ────

log() {
    local level="$1"
    local msg="$2"
    local ts
    ts=$(date '+%Y-%m-%dT%H:%M:%S')
    echo -e "${ts} [${level}] ${msg}" | tee -a "${REPORT_FILE}"
}

log_info()  { log "INFO " "${BLUE}$1${NC}"; }
log_ok()    { log "OK   " "${GREEN}$1${NC}"; }
log_warn()  { log "WARN " "${YELLOW}$1${NC}"; }
log_error() { log "ERROR" "${RED}$1${NC}"; }

# 檢查必要工具
check_dependencies() {
    log_info "Checking dependencies..."
    local missing=0

    for cmd in curl; do
        if ! command -v "${cmd}" &>/dev/null; then
            log_error "Missing required command: ${cmd}"
            missing=1
        fi
    done

    if [[ "${DB_MODE}" == "docker" ]]; then
        if ! command -v docker &>/dev/null; then
            log_error "DB_MODE=docker but 'docker' command not found"
            missing=1
        fi
    fi

    if [[ "${missing}" -eq 1 ]]; then
        log_error "Missing dependencies, aborting."
        exit 1
    fi

    log_ok "All dependencies present."
}

# API 健康檢查（回傳 HTTP status code）
check_api_health() {
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" \
        --connect-timeout 3 \
        --max-time 5 \
        "${BASE_URL}/api/v1/health" 2>/dev/null) || status="000"
    echo "${status}"
}

# 等待 API 健康（回傳 0=成功, 1=超時）
wait_for_health() {
    local max_wait="$1"
    local start
    start=$(date +%s)

    while true; do
        local now
        now=$(date +%s)
        local elapsed=$(( now - start ))

        if [[ "${elapsed}" -ge "${max_wait}" ]]; then
            return 1
        fi

        local status
        status=$(check_api_health)

        if [[ "${status}" == "200" ]]; then
            echo "${elapsed}"
            return 0
        fi

        sleep "${HEALTH_INTERVAL}"
    done
}

# 背景健康監測（寫入 CSV log）
start_health_monitor() {
    echo "timestamp,http_status,response_time_ms" > "${HEALTH_LOG}"

    while true; do
        local ts
        ts=$(date '+%Y-%m-%dT%H:%M:%S')
        local start_ms
        start_ms=$(date +%s%3N)

        local status
        status=$(check_api_health)

        local end_ms
        end_ms=$(date +%s%3N)
        local rt=$(( end_ms - start_ms ))

        echo "${ts},${status},${rt}" >> "${HEALTH_LOG}"

        sleep "${HEALTH_INTERVAL}"
    done
}

# 模擬 PostgreSQL Primary 故障
simulate_db_failure() {
    log_warn "Simulating PostgreSQL Primary failure (DB_MODE=${DB_MODE})..."

    if [[ "${DB_MODE}" == "docker" ]]; then
        # Docker 模式：pause container（模擬網路不可達 / 進程掛起）
        if docker ps --format '{{.Names}}' | grep -q "^${PG_CONTAINER}$"; then
            log_info "Pausing Docker container: ${PG_CONTAINER}"
            docker pause "${PG_CONTAINER}"
            log_ok "Container ${PG_CONTAINER} paused successfully."
        else
            log_error "Container '${PG_CONTAINER}' not found or not running!"
            log_warn "Available containers:"
            docker ps --format '{{.Names}}' | head -20 | tee -a "${REPORT_FILE}" || true
            return 1
        fi

    elif [[ "${DB_MODE}" == "native" ]]; then
        # 原生模式：kill PostgreSQL Primary process（SIGSTOP = 暫停，非終止）
        if [[ -z "${PG_PID:-}" ]]; then
            log_error "DB_MODE=native requires PG_PID to be set"
            return 1
        fi

        if kill -0 "${PG_PID}" 2>/dev/null; then
            log_info "Sending SIGSTOP to PostgreSQL PID ${PG_PID}"
            kill -SIGSTOP "${PG_PID}"
            log_ok "PostgreSQL Primary (PID=${PG_PID}) suspended."
        else
            log_error "PID ${PG_PID} not found!"
            return 1
        fi

    else
        log_error "Unknown DB_MODE: ${DB_MODE}. Use 'docker' or 'native'."
        return 1
    fi
}

# 恢復 PostgreSQL Primary（測試清理用）
restore_db() {
    log_info "Restoring PostgreSQL Primary..."

    if [[ "${DB_MODE}" == "docker" ]]; then
        docker unpause "${PG_CONTAINER}" 2>/dev/null && \
            log_ok "Container ${PG_CONTAINER} unpaused." || \
            log_warn "Could not unpause ${PG_CONTAINER} (may already be running)"

    elif [[ "${DB_MODE}" == "native" ]]; then
        if [[ -n "${PG_PID:-}" ]]; then
            kill -SIGCONT "${PG_PID}" 2>/dev/null && \
                log_ok "PostgreSQL Primary (PID=${PG_PID}) resumed." || \
                log_warn "Could not resume PID ${PG_PID}"
        fi
    fi
}

# ──── 清理 trap ────
MONITOR_PID=""
cleanup() {
    log_warn "Cleanup triggered..."

    # 停止健康監測背景進程
    if [[ -n "${MONITOR_PID}" ]] && kill -0 "${MONITOR_PID}" 2>/dev/null; then
        kill "${MONITOR_PID}" 2>/dev/null || true
    fi

    # 恢復 DB（避免測試後環境損壞）
    restore_db || true

    log_info "Cleanup complete."
}
trap cleanup EXIT INT TERM

# ──── 主流程 ────
main() {
    # 建立報告目錄
    mkdir -p "${REPORT_DIR}"

    log_info "============================================================"
    log_info " DB Failover Test — NFR-18: failover ≤${MAX_FAILOVER_SEC}s"
    log_info "============================================================"
    log_info " BASE_URL:     ${BASE_URL}"
    log_info " DB_MODE:      ${DB_MODE}"
    log_info " PG_CONTAINER: ${PG_CONTAINER}"
    log_info " Report:       ${REPORT_FILE}"
    log_info " Health log:   ${HEALTH_LOG}"
    log_info "============================================================"

    # Step 1：依賴檢查
    check_dependencies

    # Step 2：確認系統初始健康狀態
    log_info "Step 1: Verifying initial API health..."
    INITIAL_STATUS=$(check_api_health)

    if [[ "${INITIAL_STATUS}" != "200" ]]; then
        log_error "API health check failed before test! status=${INITIAL_STATUS}"
        log_error "Ensure the application is running at ${BASE_URL}"
        exit 1
    fi
    log_ok "Initial API health: OK (200)"

    # Step 3：啟動背景健康監測
    log_info "Step 2: Starting background health monitor (interval=${HEALTH_INTERVAL}s)..."
    start_health_monitor &
    MONITOR_PID=$!
    log_ok "Health monitor started (PID=${MONITOR_PID})"
    sleep 10  # 收集 10 秒基準數據

    # Step 4：模擬 DB 故障
    log_info "Step 3: Simulating PostgreSQL Primary failure..."
    FAILURE_START=$(date +%s)

    if ! simulate_db_failure; then
        log_error "Failed to simulate DB failure, aborting test."
        exit 1
    fi

    FAILURE_TIME=$(date '+%Y-%m-%dT%H:%M:%S')
    log_warn "DB failure simulated at: ${FAILURE_TIME}"

    # Step 5：等待服務降級（確認故障已觸發）
    log_info "Step 4: Waiting for service degradation..."
    DEGRADED=false
    DEGRADATION_START=""

    for i in $(seq 1 12); do  # 最多等 60 秒確認降級
        sleep 5
        STATUS=$(check_api_health)

        if [[ "${STATUS}" != "200" ]]; then
            DEGRADED=true
            DEGRADATION_START=$(date +%s)
            log_warn "Service degraded at $(date '+%H:%M:%S') — status=${STATUS}"
            break
        fi
        log_info "  Service still healthy (${i}/12 checks)... status=${STATUS}"
    done

    if [[ "${DEGRADED}" == "false" ]]; then
        log_warn "Service did not degrade within 60s — may have already failed over to replica."
        log_warn "Continuing to monitor recovery..."
        DEGRADATION_START="${FAILURE_START}"
    fi

    # Step 6：監測恢復時間
    log_info "Step 5: Monitoring service recovery (max wait=${TIMEOUT_SEC}s)..."
    RECOVERY_START=$(date +%s)
    RECOVERY_ELAPSED=""

    RECOVERY_ELAPSED=$(wait_for_health "${TIMEOUT_SEC}") && RECOVERED=true || RECOVERED=false

    if [[ "${RECOVERED}" == "true" ]]; then
        RECOVERY_END=$(date +%s)
        FAILOVER_DURATION=$(( RECOVERY_END - FAILURE_START ))

        log_ok "Service recovered! Failover duration: ${FAILOVER_DURATION}s"
        log_ok "Recovery elapsed since degradation: ${RECOVERY_ELAPSED}s"
    else
        FAILOVER_DURATION="${TIMEOUT_SEC}+"
        log_error "Service did NOT recover within ${TIMEOUT_SEC}s!"
    fi

    # Step 7：恢復 DB
    log_info "Step 6: Restoring PostgreSQL Primary..."
    restore_db

    # 等待系統穩定
    sleep 10

    # 最終健康檢查
    FINAL_STATUS=$(check_api_health)
    log_info "Step 7: Final health check: ${FINAL_STATUS}"

    # ──── 測試報告 ────
    log_info ""
    log_info "============================================================"
    log_info " FAILOVER TEST REPORT"
    log_info "============================================================"
    log_info " NFR-18 Target:           failover ≤${MAX_FAILOVER_SEC}s"

    if [[ "${RECOVERED}" == "true" ]]; then
        log_info " Failure simulated at:    ${FAILURE_TIME}"
        log_info " Failover duration:       ${FAILOVER_DURATION}s"
        log_info " Final health status:     ${FINAL_STATUS}"

        if [[ "${FAILOVER_DURATION}" -le "${MAX_FAILOVER_SEC}" ]]; then
            log_ok ""
            log_ok " RESULT: PASS — Failover completed in ${FAILOVER_DURATION}s (≤${MAX_FAILOVER_SEC}s)"
            log_ok "============================================================"
            EXIT_CODE=0
        else
            log_error ""
            log_error " RESULT: FAIL — Failover took ${FAILOVER_DURATION}s (>${MAX_FAILOVER_SEC}s)"
            log_error "============================================================"
            EXIT_CODE=1
        fi
    else
        log_error " RESULT: FAIL — Service did not recover within ${TIMEOUT_SEC}s"
        log_error "============================================================"
        EXIT_CODE=1
    fi

    log_info ""
    log_info " Health log: ${HEALTH_LOG}"
    log_info " Full report: ${REPORT_FILE}"

    # 停止健康監測
    if [[ -n "${MONITOR_PID}" ]] && kill -0 "${MONITOR_PID}" 2>/dev/null; then
        kill "${MONITOR_PID}" 2>/dev/null || true
    fi

    exit "${EXIT_CODE}"
}

main "$@"
