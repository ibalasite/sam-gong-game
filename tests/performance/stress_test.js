/**
 * stress_test.js — 壓力測試（逐步增加至失效點）
 *
 * 目的：從 100 CCU 逐步增加至 1000 CCU，
 *       找出系統承受上限（breaking point）、記錄延遲劣化點。
 *
 * 觀測指標：
 *   - ws_latency P95 何時突破 100ms（NFR-02 失效點）
 *   - error rate 何時突破 0.5%（NFR-03 失效點）
 *   - 系統何時開始拒絕連線
 *
 * 執行方式：
 *   k6 run tests/performance/stress_test.js
 *   k6 run --out json=stress_results.json tests/performance/stress_test.js
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
import { Trend, Rate, Counter, Gauge } from 'k6/metrics';

// ──── 自定義 Metrics ────
const wsLatency     = new Trend('ws_latency', true);
const wsErrors      = new Rate('ws_error_rate');
const httpErrors    = new Rate('http_error_rate');
const wsMsgsSent    = new Counter('ws_msgs_sent');
const wsMsgsRecv    = new Counter('ws_msgs_recv');
const activeSessions = new Gauge('active_ws_sessions');  // 當前活躍 WS 連線數

// ──── 壓力測試選項（逐步升至 1000 CCU） ────
export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Phase 1：100 CCU baseline
    { duration: '2m', target: 200 },   // Phase 2：200 CCU
    { duration: '2m', target: 300 },   // Phase 3：300 CCU
    { duration: '2m', target: 400 },   // Phase 4：400 CCU
    { duration: '2m', target: 500 },   // Phase 5：500 CCU（NFR-02 目標點）
    { duration: '2m', target: 600 },   // Phase 6：600 CCU（壓力區）
    { duration: '2m', target: 700 },   // Phase 7：700 CCU
    { duration: '2m', target: 800 },   // Phase 8：800 CCU
    { duration: '2m', target: 900 },   // Phase 9：900 CCU
    { duration: '2m', target: 1000 },  // Phase 10：1000 CCU（失效點探測）
    { duration: '3m', target: 1000 },  // 維持 1000 CCU 觀察穩定性
    { duration: '2m', target: 0 },     // Ramp down
  ],
  thresholds: {
    // 壓力測試：閾值設定較寬鬆（目的是找失效點，非通過/失敗）
    // 達到這些閾值代表系統正在降級
    'ws_latency':       ['p(95)<500'],   // 超過 500ms 表示嚴重降級
    'http_req_failed':  ['rate<0.05'],   // 超過 5% 表示系統接近崩潰
    'ws_error_rate':    ['rate<0.05'],
    'http_req_duration': ['p(95)<2000'], // 2s 作為壓力上限
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
      timeout: '10s',
    }
  );

  const ok = check(res, {
    'auth/login status 200': (r) => r.status === 200,
    'auth/login has token':  (r) => {
      try { return JSON.parse(r.body).access_token !== undefined; }
      catch { return false; }
    },
  });

  httpErrors.add(!ok);

  if (!ok) {
    console.warn(`[stress_test] login failed at VU=${__VU}: status=${res.status}`);
    return null;
  }

  return JSON.parse(res.body).access_token;
}

/**
 * VU 主流程：連線並持續發送訊息，記錄各負載階段延遲
 */
export default function () {
  const token = getAccessToken();
  if (!token) {
    sleep(2);
    return;
  }

  const wsUrl = `${WS_URL}?token=${token}`;
  activeSessions.add(1);

  const res = ws.connect(wsUrl, { tags: { endpoint: 'colyseus_ws' } }, function (socket) {
    let messageCount = 0;
    let lastSendTime = 0;
    let pendingLatency = false;

    socket.on('open', () => {
      socket.send(JSON.stringify({
        type: 'join_room',
        payload: { tier: 'standard', room_type: 'matchmaking' },
      }));
      wsMsgsSent.add(1);
    });

    socket.on('message', (data) => {
      wsMsgsRecv.add(1);

      // 記錄延遲（RTT）
      if (pendingLatency && lastSendTime > 0) {
        wsLatency.add(Date.now() - lastSendTime);
        pendingLatency = false;
      }

      try {
        const msg = JSON.parse(data);

        if (msg.type === 'room_joined' || msg.type === 'state_update') {
          messageCount++;
          // 壓力測試：加快訊息頻率，每秒 2 次動作
          const actions = [
            { type: 'call',       payload: {} },
            { type: 'fold',       payload: {} },
            { type: 'banker_bet', payload: { amount: 50 } },
            { type: 'call',       payload: {} },
          ];
          const action = actions[messageCount % actions.length];

          lastSendTime = Date.now();
          pendingLatency = true;

          socket.send(JSON.stringify(action));
          wsMsgsSent.add(1);
        }
      } catch (e) {
        // Binary frame，跳過
      }
    });

    socket.on('error', (e) => {
      wsErrors.add(1);
      console.error(`[stress_test] WS error at VU=${__VU}, VUs active=${__VU}: ${e.error()}`);
    });

    // 維持連線 20 秒（壓力測試縮短連線時間，讓更多 VU 可以輪替）
    socket.setTimeout(() => {
      socket.close();
    }, 20000);
  });

  activeSessions.add(-1);

  check(res, {
    'WebSocket connected (101)': (r) => r && r.status === 101,
  });

  sleep(0.5);
}
