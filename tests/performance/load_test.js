/**
 * load_test.js — 500 CCU 負載測試
 *
 * 目的：驗證 NFR-02（P95 WS 延遲 <100ms）與 NFR-03（error rate <0.5%）
 *       在穩定 500 CCU 負載下達成。
 *
 * 執行方式：
 *   k6 run tests/performance/load_test.js
 *   k6 run --env BASE_URL=https://api.samgong.io tests/performance/load_test.js
 *
 * 環境變數：
 *   BASE_URL  — REST API base URL（預設：http://localhost:3000）
 *   WS_URL    — WebSocket URL（預設：ws://localhost:2567）
 *   TEST_USER — 測試帳號 username（預設：testuser）
 *   TEST_PASS — 測試帳號 password（預設：testpass）
 */

import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// ──── 自定義 Metrics ────
const wsLatency = new Trend('ws_latency', true);       // WS 往返延遲（ms），顯示完整百分位
const wsErrors  = new Rate('ws_error_rate');            // WS 錯誤率
const httpErrors = new Rate('http_error_rate');         // HTTP 錯誤率
const wsMsgsSent = new Counter('ws_msgs_sent');         // 總發送訊息數
const wsMsgsRecv = new Counter('ws_msgs_recv');         // 總接收訊息數

// ──── 測試選項（NFR-02 / NFR-03） ────
export const options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up：逐步升至 100 CCU
    { duration: '3m', target: 500 },  // Ramp up：升至 500 CCU
    { duration: '5m', target: 500 },  // Steady state：維持 500 CCU
    { duration: '2m', target: 0 },    // Ramp down：降至 0
  ],
  thresholds: {
    // NFR-02：P95 WS 延遲 <100ms
    'ws_latency':       ['p(95)<100'],
    // NFR-03：HTTP error rate <0.5%
    'http_req_failed':  ['rate<0.005'],
    'http_error_rate':  ['rate<0.005'],
    // WS 錯誤率 <0.5%
    'ws_error_rate':    ['rate<0.005'],
    // 確保實際有發送足夠訊息量
    'ws_msgs_sent':     ['count>1000'],
    // HTTP P95 回應時間 <500ms（輔助指標）
    'http_req_duration': ['p(95)<500'],
  },
};

// ──── 環境設定 ────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WS_URL   = __ENV.WS_URL   || 'ws://localhost:2567';
const USERNAME = __ENV.TEST_USER || 'testuser';
const PASSWORD = __ENV.TEST_PASS || 'testpass';

/**
 * 取得 JWT Access Token
 * 對應 API：POST /api/v1/auth/login
 */
function getAccessToken() {
  const res = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ username: USERNAME, password: PASSWORD }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags:    { endpoint: 'auth_login' },
    }
  );

  const ok = check(res, {
    'auth/login status 200': (r) => r.status === 200,
    'auth/login has access_token': (r) => {
      try { return JSON.parse(r.body).access_token !== undefined; }
      catch { return false; }
    },
  });

  httpErrors.add(!ok);

  if (!ok) {
    console.error(`[load_test] login failed: status=${res.status} body=${res.body}`);
    return null;
  }

  return JSON.parse(res.body).access_token;
}

/**
 * VU 主流程：登入 → WS 連線 → 遊戲動作模擬 → 延遲量測
 */
export default function () {
  // Step 1：取得 JWT
  const token = getAccessToken();
  if (!token) {
    sleep(1);
    return;
  }

  // Step 2：連接 Colyseus WebSocket（帶 JWT 認證）
  const wsUrl = `${WS_URL}?token=${token}`;

  const res = ws.connect(wsUrl, { tags: { endpoint: 'colyseus_ws' } }, function (socket) {
    let messageCount = 0;
    let lastSendTime = 0;
    let pendingLatency = false;

    // WS 連線建立
    socket.on('open', () => {
      // 加入房間：發送 join 訊息
      socket.send(JSON.stringify({
        type: 'join_room',
        payload: { tier: 'standard', room_type: 'matchmaking' },
      }));
      wsMsgsSent.add(1);
    });

    // 接收 Server 訊息：量測延遲
    socket.on('message', (data) => {
      wsMsgsRecv.add(1);

      // 若有待量測的延遲，記錄 RTT
      if (pendingLatency && lastSendTime > 0) {
        const latency = Date.now() - lastSendTime;
        wsLatency.add(latency);
        pendingLatency = false;
      }

      // 解析 server 訊息，執行對應動作
      try {
        const msg = JSON.parse(data);

        if (msg.type === 'room_joined' || msg.type === 'state_update') {
          // 模擬遊戲動作：輪流發送 banker_bet / call / fold
          messageCount++;
          const actions = [
            { type: 'banker_bet', payload: { amount: 100 } },
            { type: 'call',       payload: {} },
            { type: 'fold',       payload: {} },
          ];
          const action = actions[messageCount % actions.length];

          // 記錄發送時間，用於延遲量測
          lastSendTime = Date.now();
          pendingLatency = true;

          socket.send(JSON.stringify(action));
          wsMsgsSent.add(1);
        }
      } catch (e) {
        // Binary frame（Colyseus 狀態同步），非 JSON，跳過
      }
    });

    // WS 錯誤
    socket.on('error', (e) => {
      wsErrors.add(1);
      console.error(`[load_test] WS error: ${e.error()}`);
    });

    // 維持連線 30 秒（模擬一局遊戲時間）
    socket.setTimeout(() => {
      socket.close();
    }, 30000);
  });

  // 驗證 WS 連線結果
  check(res, {
    'WebSocket connected (101)': (r) => r && r.status === 101,
  });

  // VU 間隔：隨機 1-3 秒，避免同步峰值
  sleep(1 + Math.random() * 2);
}
