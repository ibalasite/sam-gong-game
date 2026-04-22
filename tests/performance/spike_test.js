/**
 * spike_test.js — Spike 測試（突發流量）
 *
 * 目的：測試系統在 30 秒內突增 300 CCU 時的響應能力，
 *       以及峰值後系統恢復到正常延遲的速度。
 *
 * 場景：模擬熱門時段玩家大量同時上線（例如晚間 8-9 點流量高峰）
 *
 * 觀測重點：
 *   - Spike 期間 ws_latency 峰值
 *   - 系統是否在 spike 後 5 分鐘內恢復到正常水準
 *   - 錯誤率是否保持在 NFR-03 要求範圍內
 *
 * 執行方式：
 *   k6 run tests/performance/spike_test.js
 *   k6 run --out json=spike_results.json tests/performance/spike_test.js
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
const wsLatency  = new Trend('ws_latency', true);
const wsErrors   = new Rate('ws_error_rate');
const httpErrors = new Rate('http_error_rate');
const wsMsgsSent = new Counter('ws_msgs_sent');
const wsMsgsRecv = new Counter('ws_msgs_recv');

// ──── Spike 測試選項 ────
export const options = {
  stages: [
    // 第一階段：靜默基準（0 → 10 CCU，確認系統正常）
    { duration: '1m',  target: 10  },

    // 第二階段：Spike 突發（30 秒內 10 → 300 CCU）
    { duration: '30s', target: 300 },

    // 第三階段：維持峰值 2 分鐘，觀察系統是否崩潰
    { duration: '2m',  target: 300 },

    // 第四階段：Spike 結束，30 秒內降回基準（10 CCU）
    { duration: '30s', target: 10  },

    // 第五階段：恢復觀察期（5 分鐘），驗證系統是否回到正常延遲
    { duration: '5m',  target: 10  },

    // 第六階段：完全停止
    { duration: '30s', target: 0   },
  ],
  thresholds: {
    // Spike 測試：允許短暫超過 NFR-02，但整體 P95 需 <200ms
    'ws_latency':        ['p(95)<200'],
    // NFR-03：整體 error rate <0.5%（Spike 期間短暫超標可接受，但整體需達標）
    'http_req_failed':   ['rate<0.005'],
    'ws_error_rate':     ['rate<0.01'],   // Spike 期間放寬至 1%
    'http_req_duration': ['p(95)<1000'],  // Spike 期間允許至 1s
    'ws_msgs_sent':      ['count>500'],
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
      timeout: '15s',  // Spike 期間登入可能較慢，延長逾時
    }
  );

  const ok = check(res, {
    'auth/login status 200':    (r) => r.status === 200,
    'auth/login response time': (r) => r.timings.duration < 3000,
    'auth/login has token':     (r) => {
      try { return JSON.parse(r.body).access_token !== undefined; }
      catch { return false; }
    },
  });

  httpErrors.add(!ok);

  if (!ok) {
    console.warn(`[spike_test] login failed VU=${__VU}: status=${res.status} time=${res.timings.duration}ms`);
    return null;
  }

  return JSON.parse(res.body).access_token;
}

/**
 * VU 主流程：連線 → 發送動作 → 量測 Spike 期間延遲
 */
export default function () {
  const token = getAccessToken();
  if (!token) {
    sleep(2);
    return;
  }

  const wsUrl = `${WS_URL}?token=${token}`;

  const res = ws.connect(wsUrl, {
    tags:    { endpoint: 'colyseus_ws' },
    headers: { 'Authorization': `Bearer ${token}` },
  }, function (socket) {
    let messageCount  = 0;
    let lastSendTime  = 0;
    let pendingLatency = false;
    const sessionStart = Date.now();

    socket.on('open', () => {
      socket.send(JSON.stringify({
        type: 'join_room',
        payload: { tier: 'standard', room_type: 'matchmaking' },
      }));
      wsMsgsSent.add(1);
    });

    socket.on('message', (data) => {
      wsMsgsRecv.add(1);

      // 量測 RTT
      if (pendingLatency && lastSendTime > 0) {
        const rtt = Date.now() - lastSendTime;
        wsLatency.add(rtt);

        // Spike 期間若延遲 >100ms，輸出警告供分析
        if (rtt > 100) {
          const elapsed = ((Date.now() - sessionStart) / 1000).toFixed(1);
          console.warn(`[spike_test] High latency detected: ${rtt}ms at ${elapsed}s VU=${__VU}`);
        }

        pendingLatency = false;
      }

      try {
        const msg = JSON.parse(data);

        if (msg.type === 'room_joined' || msg.type === 'state_update') {
          messageCount++;

          // Spike 測試動作序列
          const actions = [
            { type: 'call',       payload: {} },
            { type: 'banker_bet', payload: { amount: 100 } },
            { type: 'fold',       payload: {} },
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
      console.error(`[spike_test] WS error VU=${__VU}: ${e.error()}`);
    });

    // Spike 測試：每個 VU 連線 25 秒
    socket.setTimeout(() => {
      socket.close();
    }, 25000);
  });

  check(res, {
    'WebSocket connected (101)': (r) => r && r.status === 101,
  });

  // 短暫休息後重新嘗試（模擬玩家重連行為）
  sleep(1 + Math.random());
}
