# 效能測試套件 — Performance Tests

## 概述

本目錄包含三公遊戲（Sam Gong）的效能測試腳本，用於驗證以下非功能需求（NFR）：

| NFR | 目標 | 測試腳本 |
|-----|------|---------|
| NFR-02 | P95 WS 延遲 <100ms（500 CCU 下） | `load_test.js` |
| NFR-03 | 99.5% SLA（error rate <0.5%） | `load_test.js`, `stress_test.js` |
| NFR-18 | DB failover ≤5min | `db_failover_test.sh` |
| NFR-19 | 速率限制正確回應 429 + Retry-After | `rate_limit_test.js` |

---

## 環境需求

### k6 安裝

```bash
# macOS
brew install k6

# Linux（Debian/Ubuntu）
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Windows（Chocolatey）
choco install k6

# Docker
docker run --rm -i grafana/k6 run - <script.js
```

### 其他依賴

```bash
# db_failover_test.sh 需要：
# - bash 4.x+
# - curl
# - docker（DB_MODE=docker）或 pg_ctl（DB_MODE=native）
# - jq（選用）
```

---

## 環境變數設定

所有 k6 腳本支援以下環境變數：

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `BASE_URL` | `http://localhost:3000` | REST API base URL |
| `WS_URL` | `ws://localhost:2567` | Colyseus WebSocket URL |
| `TEST_USER` | `testuser` | 測試帳號 username |
| `TEST_PASS` | `testpass` | 測試帳號 password |

---

## 測試腳本說明

### 1. load_test.js — 500 CCU 負載測試（NFR-02 / NFR-03）

**目的**：驗證系統在穩定 500 CCU 負載下，P95 WS 延遲 <100ms，error rate <0.5%。

**測試階段**：
- Ramp up：0 → 100 CCU（2 分鐘）
- Ramp up：100 → 500 CCU（3 分鐘）
- Steady state：500 CCU（5 分鐘）
- Ramp down：500 → 0（2 分鐘）

**執行方式**：

```bash
# 本地環境
k6 run tests/performance/load_test.js

# 指定環境
k6 run \
  --env BASE_URL=https://api.samgong.io \
  --env WS_URL=wss://ws.samgong.io \
  --env TEST_USER=perf_user \
  --env TEST_PASS=perf_pass \
  tests/performance/load_test.js

# 輸出 JSON 結果（供後續分析）
k6 run --out json=reports/load_results.json tests/performance/load_test.js

# 輸出至 Grafana InfluxDB
k6 run --out influxdb=http://localhost:8086/k6 tests/performance/load_test.js
```

**判讀結果**：
- `ws_latency p(95)` < 100ms → NFR-02 通過
- `http_req_failed rate` < 0.005 → NFR-03 通過
- `ws_error_rate rate` < 0.005 → WS 穩定性通過

---

### 2. stress_test.js — 壓力測試（破壞性測試）

**目的**：從 100 CCU 逐步增加至 1000 CCU，找出系統承受上限和延遲劣化點。

**測試階段**：
- 每 2 分鐘增加 100 CCU，從 100 → 1000 CCU
- 維持 1000 CCU 3 分鐘觀察穩定性
- Ramp down 2 分鐘

**執行方式**：

```bash
# 執行壓力測試（建議輸出 JSON 供分析）
k6 run --out json=reports/stress_results.json tests/performance/stress_test.js

# 即時觀察（搭配 Grafana）
k6 run --out influxdb=http://localhost:8086/k6 tests/performance/stress_test.js
```

**判讀結果**：
- 觀察 `ws_latency p(95)` 在哪個 CCU 階段突破 100ms（NFR-02 失效點）
- 觀察 `ws_error_rate` 開始上升的 CCU 值
- `active_ws_sessions` Gauge 可顯示當前活躍連線數

---

### 3. spike_test.js — Spike 突發流量測試

**目的**：測試系統在 30 秒內突增 300 CCU 時的响應能力與恢復速度。

**測試階段**：
- 基準（10 CCU，1 分鐘）
- Spike（10 → 300 CCU，30 秒）
- 峰值維持（300 CCU，2 分鐘）
- Spike 結束（300 → 10 CCU，30 秒）
- 恢復觀察（10 CCU，5 分鐘）

**執行方式**：

```bash
k6 run tests/performance/spike_test.js

# 輸出詳細 JSON
k6 run --out json=reports/spike_results.json tests/performance/spike_test.js
```

**判讀結果**：
- Spike 期間 `ws_latency` 峰值（可接受短暫超過 100ms）
- 恢復期（最後 5 分鐘）`ws_latency p(95)` 是否回到 <100ms
- `ws_error_rate` 整體不超過 1%

---

### 4. rate_limit_test.js — 速率限制驗證（NFR-19）

**目的**：驗證各 API 端點速率限制正確觸發 429，且包含 Retry-After header。

**測試場景**：
- **場景 A**：取得合法 JWT
- **場景 B**：Auth 端點 35 連打 → 第 30 次後應 429
- **場景 C**：Daily Chip 端點 8 連打 → 第 5 次後應 429
- **場景 D**：等待 Retry-After 秒數後重試，驗證恢復

**執行方式**：

```bash
# 速率限制測試（執行約 3-5 分鐘）
k6 run tests/performance/rate_limit_test.js

# 注意：此測試不應與其他負載測試同時執行（IP 維度干擾）
```

**判讀結果**：
- `rate_limit_429_hits count` > 0 → 速率限制有觸發
- `retry_after_header_rate rate` > 0.99 → Retry-After header 正確
- `correct_rate_limit_rate rate` > 0.95 → 速率限制行為正確

---

### 5. db_failover_test.sh — DB Failover 測試（NFR-18）

**目的**：模擬 PostgreSQL Primary 故障，驗證 failover 時間 ≤5 分鐘（300 秒）。

**環境變數**：

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `BASE_URL` | `http://localhost:3000` | API 健康檢查 URL |
| `DB_MODE` | `docker` | 故障模式：`docker` 或 `native` |
| `PG_CONTAINER` | `postgres-primary` | Docker container 名稱 |
| `PG_PID` | - | PostgreSQL Primary PID（native 模式） |
| `MAX_FAILOVER_SEC` | `300` | NFR-18 最大 failover 時間（秒） |
| `HEALTH_INTERVAL` | `5` | 健康檢查間隔（秒） |
| `TIMEOUT_SEC` | `360` | 等待恢復最大時間（秒） |

**執行方式**：

```bash
# 確保腳本有執行權限
chmod +x tests/performance/db_failover_test.sh

# Docker 模式（預設）
./tests/performance/db_failover_test.sh

# 指定 container 名稱
PG_CONTAINER=postgres_primary_1 ./tests/performance/db_failover_test.sh

# 原生 PostgreSQL 模式
DB_MODE=native PG_PID=12345 ./tests/performance/db_failover_test.sh

# 自訂 API URL
BASE_URL=https://api.samgong.io ./tests/performance/db_failover_test.sh
```

**測試前提**：
1. 系統必須已設定 PostgreSQL Streaming Replication 或 Patroni 等 HA 方案
2. API 必須已啟動且健康（`GET /api/v1/health` 回傳 200）
3. Docker 模式需有 `postgres-primary` container 正在運行

**判讀結果**：
- 測試報告儲存於 `tests/performance/reports/db_failover_YYYYMMDD_HHMMSS.txt`
- 健康監測 CSV 儲存於 `tests/performance/reports/health_log_YYYYMMDD_HHMMSS.csv`
- 腳本結束碼：`0` = PASS，`1` = FAIL

---

## CI/CD 整合

### GitHub Actions 範例

```yaml
name: Performance Tests

on:
  schedule:
    - cron: '0 2 * * *'  # 每天凌晨 2 點執行
  workflow_dispatch:

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install k6
        run: |
          sudo gpg --no-default-keyring \
            --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
            --keyserver hkp://keyserver.ubuntu.com:80 \
            --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | \
            sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update && sudo apt-get install k6

      - name: Run Load Test (NFR-02/NFR-03)
        env:
          BASE_URL: ${{ secrets.PERF_BASE_URL }}
          WS_URL: ${{ secrets.PERF_WS_URL }}
          TEST_USER: ${{ secrets.PERF_USER }}
          TEST_PASS: ${{ secrets.PERF_PASS }}
        run: |
          k6 run \
            --out json=reports/load_results.json \
            tests/performance/load_test.js

      - name: Upload Results
        uses: actions/upload-artifact@v4
        with:
          name: performance-results
          path: reports/
```

---

## 結果解讀指引

### k6 指標說明

| 指標 | 說明 | NFR 對應 |
|------|------|---------|
| `ws_latency p(95)` | 95th percentile WS 往返延遲 | NFR-02 <100ms |
| `http_req_failed rate` | HTTP 請求失敗率 | NFR-03 <0.5% |
| `ws_error_rate rate` | WS 連線錯誤率 | NFR-03 <0.5% |
| `http_req_duration p(95)` | HTTP 回應時間 P95 | 輔助監控 |
| `ws_msgs_sent count` | 總發送 WS 訊息數 | 測試覆蓋度 |
| `rate_limit_429_hits count` | 觸發速率限制次數 | NFR-19 |

### 常見問題排查

**問題：WS 連線失敗（status != 101）**
- 確認 Colyseus server 正在運行（port 2567）
- 確認 JWT token 有效（未過期）
- 確認 WS_URL 設定正確

**問題：Auth 登入一直 429**
- 等待 1 分鐘後重試（速率限制重置）
- 使用不同的測試 IP 或 VPN

**問題：stress_test 中斷很快**
- 這可能是正常的失效點偵測結果
- 查看 k6 輸出中各階段的錯誤率和延遲

**問題：db_failover_test.sh 找不到 container**
- 確認 container 名稱：`docker ps --format '{{.Names}}'`
- 設定 `PG_CONTAINER=your_container_name`
