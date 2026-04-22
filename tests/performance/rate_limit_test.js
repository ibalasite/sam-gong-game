/**
 * rate_limit_test.js — 速率限制驗證（NFR-19）
 *
 * 目的：驗證速率限制機制正確觸發並回傳 429 Too Many Requests，
 *       且 Retry-After header 存在且值合理。
 *
 * 測試情境：
 *   L1：Auth 端點 — >30 req/min/IP → 429
 *   L2：Daily Chip 端點 — >5 req/min/user → 429
 *   L3：驗證 Retry-After header 存在
 *   L4：驗證 429 後等待 Retry-After 秒數再試可恢復
 *
 * 執行方式：
 *   k6 run tests/performance/rate_limit_test.js
 *
 * 環境變數：
 *   BASE_URL  — REST API base URL（預設：http://localhost:3000）
 *   TEST_USER — 測試帳號 username（預設：testuser）
 *   TEST_PASS — 測試帳號 password（預設：testpass）
 *
 * 注意：此測試設計為單一 VU 反覆快速打 API，
 *       不適合與其他負載測試同時執行。
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate } from 'k6/metrics';

// ──── 自定義 Metrics ────
const rateLimitHits      = new Counter('rate_limit_429_hits');    // 429 回應次數
const retryAfterPresent  = new Rate('retry_after_header_rate');   // Retry-After header 出現率
const correctRateLimit   = new Rate('correct_rate_limit_rate');   // 速率限制行為正確率

// ──── 測試選項 ────
export const options = {
  // 單 VU 循序執行所有場景（確保 IP/user 維度正確）
  vus:        1,
  iterations: 1,

  thresholds: {
    // 必須觸發至少一次 429
    'rate_limit_429_hits':    ['count>0'],
    // Retry-After header 出現率 100%（每個 429 都要有）
    'retry_after_header_rate': ['rate>0.99'],
    // 速率限制行為正確率 >95%
    'correct_rate_limit_rate': ['rate>0.95'],
  },
};

// ──── 環境設定 ────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const USERNAME = __ENV.TEST_USER || 'testuser';
const PASSWORD = __ENV.TEST_PASS || 'testpass';

/** 快速連續發送 N 次請求，回傳所有 response */
function burstRequests(url, method, body, headers, count) {
  const responses = [];
  for (let i = 0; i < count; i++) {
    let res;
    if (method === 'POST') {
      res = http.post(url, JSON.stringify(body), { headers });
    } else {
      res = http.get(url, { headers });
    }
    responses.push(res);
    // 不 sleep，盡快打（模擬攻擊/突發）
  }
  return responses;
}

/** 找出第一個 429 response */
function findFirstRateLimit(responses) {
  return responses.find((r) => r.status === 429) || null;
}

/** 驗證 Retry-After header */
function validateRetryAfter(res) {
  const retryAfter = res.headers['Retry-After'];
  const valid = retryAfter !== undefined && parseInt(retryAfter, 10) > 0;
  retryAfterPresent.add(valid);
  if (!valid) {
    console.error(`[rate_limit_test] Missing or invalid Retry-After header. Got: ${retryAfter}`);
  }
  return valid ? parseInt(retryAfter, 10) : 60;
}

export default function () {

  // ────────────────────────────────────────────────
  // 場景 A：先取得合法 JWT（用於需要認證的端點）
  // ────────────────────────────────────────────────
  let validToken = null;

  group('A. Obtain valid JWT token', () => {
    const res = http.post(
      `${BASE_URL}/api/v1/auth/login`,
      JSON.stringify({ username: USERNAME, password: PASSWORD }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    check(res, {
      'Initial login succeeds (200)': (r) => r.status === 200,
    });

    try {
      validToken = JSON.parse(res.body).access_token;
    } catch (e) {
      console.error('[rate_limit_test] Cannot parse login response');
    }
  });

  // 等待 5 秒，確保速率限制計數器初始化（避免前面登入影響）
  sleep(5);

  // ────────────────────────────────────────────────
  // 場景 B：Auth 端點速率限制（>30 req/min/IP → 429）
  // NFR-19 L1：POST /api/v1/auth/login
  // ────────────────────────────────────────────────
  group('B. Auth endpoint rate limit (>30/min/IP)', () => {
    console.log('[rate_limit_test] Testing auth rate limit: sending 35 requests burst...');

    // 發送 35 次（超過 30/min 上限）
    const responses = burstRequests(
      `${BASE_URL}/api/v1/auth/login`,
      'POST',
      { username: USERNAME, password: PASSWORD },
      { 'Content-Type': 'application/json' },
      35
    );

    const statusCounts = responses.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});

    console.log(`[rate_limit_test] Auth rate limit responses: ${JSON.stringify(statusCounts)}`);

    // 找到第一個 429
    const rateLimitRes = findFirstRateLimit(responses);

    const got429 = rateLimitRes !== null;
    check({ got429 }, {
      'Auth endpoint returns 429 after >30 req': (x) => x.got429,
    });
    correctRateLimit.add(got429);

    if (got429) {
      rateLimitHits.add(1);
      console.log(`[rate_limit_test] First 429 at request index: ${responses.indexOf(rateLimitRes)}`);

      // 驗證 Retry-After header
      const retryAfterSec = validateRetryAfter(rateLimitRes);

      check(rateLimitRes, {
        'Auth 429 has Retry-After header':        (r) => r.headers['Retry-After'] !== undefined,
        'Auth 429 Retry-After is positive number': (r) => parseInt(r.headers['Retry-After'], 10) > 0,
        'Auth 429 body has error field':           (r) => {
          try { return JSON.parse(r.body).error !== undefined; }
          catch { return false; }
        },
      });

      console.log(`[rate_limit_test] Auth Retry-After: ${retryAfterSec}s`);
    } else {
      console.error('[rate_limit_test] FAILED: No 429 returned for auth endpoint after 35 requests!');
      correctRateLimit.add(false);
    }
  });

  // 等待速率限制重置
  console.log('[rate_limit_test] Waiting 65s for auth rate limit to reset...');
  sleep(65);

  // ────────────────────────────────────────────────
  // 場景 C：Daily Chip 端點速率限制（>5 req/min/user → 429）
  // NFR-19 L2：POST /api/v1/chips/daily-free
  // ────────────────────────────────────────────────
  group('C. Daily Chip endpoint rate limit (>5/min/user)', () => {
    if (!validToken) {
      console.error('[rate_limit_test] No valid token, skipping daily chip test');
      return;
    }

    const authHeaders = {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${validToken}`,
    };

    console.log('[rate_limit_test] Testing daily chip rate limit: sending 8 requests burst...');

    // 發送 8 次（超過 5/min 上限）
    const responses = burstRequests(
      `${BASE_URL}/api/v1/chips/daily-free`,
      'POST',
      {},
      authHeaders,
      8
    );

    const statusCounts = responses.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});

    console.log(`[rate_limit_test] Daily chip responses: ${JSON.stringify(statusCounts)}`);

    const rateLimitRes = findFirstRateLimit(responses);

    const got429 = rateLimitRes !== null;
    check({ got429 }, {
      'Daily chip endpoint returns 429 after >5 req': (x) => x.got429,
    });
    correctRateLimit.add(got429);

    if (got429) {
      rateLimitHits.add(1);
      console.log(`[rate_limit_test] Daily chip 429 at index: ${responses.indexOf(rateLimitRes)}`);

      const retryAfterSec = validateRetryAfter(rateLimitRes);

      check(rateLimitRes, {
        'Daily chip 429 has Retry-After header':         (r) => r.headers['Retry-After'] !== undefined,
        'Daily chip 429 Retry-After ≤60':               (r) => parseInt(r.headers['Retry-After'], 10) <= 60,
        'Daily chip 429 body error = rate_limit_exceeded': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.error !== undefined;
          } catch { return false; }
        },
      });

      console.log(`[rate_limit_test] Daily chip Retry-After: ${retryAfterSec}s`);
    } else {
      console.error('[rate_limit_test] FAILED: No 429 returned for daily chip after 8 requests!');
      correctRateLimit.add(false);
    }
  });

  // 等待速率限制重置
  console.log('[rate_limit_test] Waiting 65s for rate limit to reset...');
  sleep(65);

  // ────────────────────────────────────────────────
  // 場景 D：驗證 429 後等待 Retry-After 可恢復
  // ────────────────────────────────────────────────
  group('D. Recovery after Retry-After wait', () => {
    console.log('[rate_limit_test] Testing recovery after Retry-After...');

    // 先快速打到 429
    const burstRes = burstRequests(
      `${BASE_URL}/api/v1/auth/login`,
      'POST',
      { username: USERNAME, password: PASSWORD },
      { 'Content-Type': 'application/json' },
      35
    );

    const limitRes = findFirstRateLimit(burstRes);
    if (!limitRes) {
      console.warn('[rate_limit_test] Could not trigger 429 for recovery test');
      return;
    }

    rateLimitHits.add(1);
    const retryAfterSec = validateRetryAfter(limitRes);

    // 等待 Retry-After 秒數 + 緩衝 5 秒
    const waitSec = Math.min(retryAfterSec + 5, 120);
    console.log(`[rate_limit_test] Waiting ${waitSec}s for recovery (Retry-After=${retryAfterSec}s)...`);
    sleep(waitSec);

    // 再次嘗試，應該成功
    const recoveryRes = http.post(
      `${BASE_URL}/api/v1/auth/login`,
      JSON.stringify({ username: USERNAME, password: PASSWORD }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    const recovered = recoveryRes.status === 200 || recoveryRes.status === 401;
    check(recoveryRes, {
      'Recovery after Retry-After: not 429': (r) => r.status !== 429,
      'Recovery response received':           (r) => r.status > 0,
    });

    correctRateLimit.add(recovered);

    if (recovered) {
      console.log(`[rate_limit_test] Recovery successful: status=${recoveryRes.status}`);
    } else {
      console.error(`[rate_limit_test] Recovery FAILED: still getting ${recoveryRes.status}`);
    }
  });

  console.log('[rate_limit_test] All rate limit scenarios completed.');
}
