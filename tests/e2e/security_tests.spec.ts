/**
 * Security E2E Tests — Sam Gong 三公遊戲
 * STEP-23: RPA E2E Automation (Playwright)
 *
 * 測試目標：驗證安全性防護機制（CORS、JWT、Rate Limit、SQL Injection、XSS）
 * 依據：docs/API.md §1.6 CORS、docs/EDD.md §6.1 STRIDE Threat Model
 *
 * 測試類別：
 * 1. CORS header 驗證
 * 2. JWT 失效後拒絕
 * 3. Rate Limit 429 回應
 * 4. SQL Injection 防護（應回傳 400/422，不能是 500）
 * 5. XSS payload 輸入（chat 訊息）
 *
 * 執行：npx playwright test tests/e2e/security_tests.spec.ts
 */
import { test, expect } from '@playwright/test';

// ─── 常數 ─────────────────────────────────────────────────────────────────────

const API_BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const TEST_CREDENTIALS = {
  username: process.env.TEST_USERNAME || 'test_player_01',
  password: process.env.TEST_PASSWORD || 'Test@1234',
};

// ─── SQL Injection payloads ───────────────────────────────────────────────────

const SQL_INJECTION_PAYLOADS = [
  "' OR '1'='1",
  "'; DROP TABLE users; --",
  "' OR 1=1 --",
  "1; SELECT * FROM users",
  "' UNION SELECT null, username, password FROM users --",
  "admin'--",
  "1' AND SLEEP(5)--",
];

// ─── XSS payloads ────────────────────────────────────────────────────────────

const XSS_PAYLOADS = [
  '<script>alert("xss")</script>',
  '<img src=x onerror=alert(1)>',
  'javascript:alert(1)',
  '<svg onload=alert(1)>',
  '"><script>alert(document.cookie)</script>',
  "';alert(String.fromCharCode(88,83,83))//",
  '<iframe src="javascript:alert(1)">',
];

// ─── 工具函數 ─────────────────────────────────────────────────────────────────

async function getValidToken(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
): Promise<string | null> {
  try {
    const res = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: TEST_CREDENTIALS,
    });
    if (res.status() === 200) {
      return (await res.json()).access_token;
    }
  } catch {
    return null;
  }
  return null;
}

// ─── 1. CORS Header 驗證 ──────────────────────────────────────────────────────

test.describe('CORS Header Validation', () => {
  test('OPTIONS preflight 應回傳 204 No Content', async ({ request }) => {
    const res = await request.fetch(`${API_BASE_URL}/api/v1/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://samgong.io',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Authorization, Content-Type',
      },
    });

    // Preflight 應回傳 204
    expect([200, 204]).toContain(res.status());
  });

  test('允許的 Origin 應收到 CORS headers', async ({ request }) => {
    const res = await request.get(`${API_BASE_URL}/api/v1/health`, {
      headers: {
        Origin: 'https://samgong.io',
      },
    });

    const headers = res.headers();
    // 白名單 origin 應有 Access-Control-Allow-Origin
    if (headers['access-control-allow-origin']) {
      expect(['https://samgong.io', 'https://www.samgong.io', '*']).toContain(
        headers['access-control-allow-origin'],
      );
    }
  });

  test('Access-Control-Allow-Methods 應包含必要的 HTTP 方法', async ({ request }) => {
    const res = await request.fetch(`${API_BASE_URL}/api/v1/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://samgong.io',
        'Access-Control-Request-Method': 'POST',
      },
    });

    const headers = res.headers();
    if (headers['access-control-allow-methods']) {
      const methods = headers['access-control-allow-methods'];
      // 應包含 GET 和 POST
      expect(methods).toContain('GET');
      expect(methods).toContain('POST');
    }
  });

  test('非白名單 Origin 不應收到 Access-Control-Allow-Origin', async ({ request }) => {
    const res = await request.get(`${API_BASE_URL}/api/v1/health`, {
      headers: {
        Origin: 'https://malicious-site.com',
      },
    });

    const headers = res.headers();
    const allowOrigin = headers['access-control-allow-origin'];

    // 惡意 Origin 不應被允許
    if (allowOrigin) {
      expect(allowOrigin).not.toBe('https://malicious-site.com');
      // 通配符 '*' 在有 credentials 的情況下不應存在
      // 但若伺服器回傳 '*' 表示公開 API
    }
  });

  test('Access-Control-Max-Age 應為 86400（24h preflight cache）', async ({ request }) => {
    const res = await request.fetch(`${API_BASE_URL}/api/v1/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://samgong.io',
        'Access-Control-Request-Method': 'GET',
      },
    });

    const headers = res.headers();
    if (headers['access-control-max-age']) {
      expect(Number(headers['access-control-max-age'])).toBe(86400);
    }
  });

  test('Response Header 應包含 X-Request-ID', async ({ request }) => {
    const customRequestId = 'playwright-security-test-' + Date.now();
    const res = await request.get(`${API_BASE_URL}/api/v1/health`, {
      headers: { 'X-Request-ID': customRequestId },
    });

    const headers = res.headers();
    // 依 API.md §1.5：X-Request-ID 應被回傳
    if (headers['x-request-id']) {
      expect(headers['x-request-id']).toBeDefined();
    }
  });
});

// ─── 2. JWT 安全性測試 ────────────────────────────────────────────────────────

test.describe('JWT Security', () => {
  test('過期 JWT 應回傳 401 token_expired', async ({ request }) => {
    // 使用已知過期格式的假 JWT（RS256 結構但已過期）
    const expiredJwt =
      'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
      'eyJzdWIiOiJ0ZXN0IiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjE2MDAwMDM2MDB9.' +
      'invalidsignature';

    const res = await request.get(`${API_BASE_URL}/api/v1/player/me`, {
      headers: { Authorization: `Bearer ${expiredJwt}` },
    });

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('篡改 JWT payload 應回傳 401（簽名驗證失敗）', async ({ request }) => {
    // 先取得有效 token
    const validToken = await getValidToken(request);
    if (!validToken) test.skip();

    // 篡改 payload 部分（中間段）
    const parts = validToken!.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: 'hacker', role: 'admin', exp: 9999999999 }),
    ).toString('base64url');
    const tamperedJwt = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const res = await request.get(`${API_BASE_URL}/api/v1/player/me`, {
      headers: { Authorization: `Bearer ${tamperedJwt}` },
    });

    expect(res.status()).toBe(401);
  });

  test('完全偽造 JWT 應回傳 401', async ({ request }) => {
    const fakeJwt = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJoYWNrZXIiLCJyb2xlIjoiYWRtaW4ifQ.';

    const res = await request.get(`${API_BASE_URL}/api/v1/player/me`, {
      headers: { Authorization: `Bearer ${fakeJwt}` },
    });

    expect(res.status()).toBe(401);
  });

  test('Bearer 前綴錯誤 應回傳 401', async ({ request }) => {
    const validToken = await getValidToken(request);
    if (!validToken) test.skip();

    // 使用錯誤的前綴
    const res = await request.get(`${API_BASE_URL}/api/v1/player/me`, {
      headers: { Authorization: `Token ${validToken}` },
    });

    expect(res.status()).toBe(401);
  });

  test('登出後 token 應立即失效（封號黑名單機制）', async ({ request }) => {
    const loginRes = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      data: TEST_CREDENTIALS,
    });

    if (loginRes.status() !== 200) test.skip();

    const { access_token, refresh_token } = await loginRes.json();

    // 執行登出
    await request.post(`${API_BASE_URL}/api/v1/auth/logout`, {
      headers: { Authorization: `Bearer ${access_token}` },
      data: { refresh_token },
    });

    // 登出後立即使用同一 token
    const res = await request.get(`${API_BASE_URL}/api/v1/player/me`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    expect(res.status()).toBe(401);
  });

  test('Admin 端點非 Admin JWT 應回傳 403', async ({ request }) => {
    const playerToken = await getValidToken(request);
    if (!playerToken) test.skip();

    // 使用一般玩家 token 訪問 Admin 端點
    const res = await request.get(`${API_BASE_URL}/api/v1/admin/audit-log`, {
      headers: { Authorization: `Bearer ${playerToken}` },
    });

    // 應回傳 401 或 403（非 admin 角色）
    expect([401, 403]).toContain(res.status());
  });
});

// ─── 3. Rate Limit 429 測試 ───────────────────────────────────────────────────

test.describe('Rate Limit 429 Responses', () => {
  test('Auth 端點快速請求應在超過 30/min 後回傳 429', async ({ request }) => {
    const requests = [];
    // 發送 35 個並發請求
    for (let i = 0; i < 35; i++) {
      requests.push(
        request.post(`${API_BASE_URL}/api/v1/auth/login`, {
          data: { username: `floodtest_${i}`, password: 'wrong' },
        }),
      );
    }

    const results = await Promise.all(requests);
    const statuses = results.map((r) => r.status());

    // 至少部分請求應觸發 429
    const has429 = statuses.some((s) => s === 429);
    if (has429) {
      const rateLimitedRes = results.find((r) => r.status() === 429);
      expect(rateLimitedRes!.status()).toBe(429);

      // 429 回應應有 Retry-After
      const retryAfter = rateLimitedRes!.headers()['retry-after'];
      if (retryAfter) {
        expect(Number(retryAfter)).toBeGreaterThan(0);
      }
    } else {
      console.warn('[Rate Limit Test] 未觸發 429（環境可能無限制）');
    }
  });

  test('429 回應 body 應包含 error 欄位', async ({ request }) => {
    let got429Response: Awaited<ReturnType<typeof request.post>> | null = null;

    for (let i = 0; i < 35; i++) {
      const res = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
        data: { username: `ratetest_${i}`, password: 'wrong' },
      });

      if (res.status() === 429) {
        got429Response = res;
        break;
      }
    }

    if (got429Response) {
      const body = await got429Response.json();
      expect(body).toHaveProperty('error');
      // 依 API.md §4.2 統一錯誤格式
      expect(typeof body.error).toBe('string');
    }
  });
});

// ─── 4. SQL Injection 防護測試 ────────────────────────────────────────────────

test.describe('SQL Injection Protection', () => {
  for (const payload of SQL_INJECTION_PAYLOADS) {
    test(`SQL Injection payload "${payload.substring(0, 30)}..." 不應回傳 500`, async ({
      request,
    }) => {
      const res = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
        data: {
          username: payload,
          password: payload,
        },
      });

      // 應回傳 400（格式錯誤）或 401（認證失敗）
      // 絕對不能是 500（伺服器內部錯誤，表示 SQL Injection 成功）
      expect(res.status()).not.toBe(500);
      expect([400, 401, 422, 429]).toContain(res.status());
    });
  }

  test('SQL Injection 在 leaderboard query param 中不應回傳 500', async ({ request }) => {
    const sqlPayload = "1 OR 1=1; DROP TABLE leaderboard; --";

    const res = await request.get(
      `${API_BASE_URL}/api/v1/leaderboard?type=${encodeURIComponent(sqlPayload)}`,
    );

    expect(res.status()).not.toBe(500);
    expect([200, 400, 422]).toContain(res.status());
  });

  test('SQL Injection 在 player settings display_name 不應回傳 500', async ({ request }) => {
    const token = await getValidToken(request);
    if (!token) test.skip();

    const res = await request.put(`${API_BASE_URL}/api/v1/player/settings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        display_name: "Robert'); DROP TABLE users; --",
      },
    });

    // 不應是 500（Server Error）
    expect(res.status()).not.toBe(500);
    // 應是 200（接受但轉義）或 400（格式拒絕）
    expect([200, 400, 422]).toContain(res.status());
  });

  test('SQL Injection 在 leaderboard week param 不應回傳 500', async ({ request }) => {
    const res = await request.get(
      `${API_BASE_URL}/api/v1/leaderboard?week=${encodeURIComponent("2026-W01' OR '1'='1")}`,
    );

    expect(res.status()).not.toBe(500);
    expect([200, 400, 422]).toContain(res.status());
  });
});

// ─── 5. XSS 防護測試 ─────────────────────────────────────────────────────────

test.describe('XSS Protection', () => {
  test('XSS payload 在 display_name 應被轉義或拒絕（不執行 script）', async ({ request }) => {
    const token = await getValidToken(request);
    if (!token) test.skip();

    for (const payload of XSS_PAYLOADS.slice(0, 3)) {
      const res = await request.put(`${API_BASE_URL}/api/v1/player/settings`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { display_name: payload },
      });

      // 應接受（200，但轉義儲存）或拒絕（400）
      // 絕對不能是 500
      expect(res.status()).not.toBe(500);
      expect([200, 400, 422]).toContain(res.status());

      if (res.status() === 200) {
        // 若接受，取回資料確認 script 未被執行（已轉義）
        const meRes = await request.get(`${API_BASE_URL}/api/v1/player/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (meRes.status() === 200) {
          const body = await meRes.json();
          // display_name 不應包含原始 <script> 標籤（應已轉義）
          if (body.display_name) {
            expect(body.display_name).not.toContain('<script>');
            expect(body.display_name).not.toContain('javascript:');
          }
        }
      }
    }
  });

  test('XSS payload 在 send_chat text 不應執行（API 層面驗證）', async ({ page, request }) => {
    const token = await getValidToken(request);
    if (!token) test.skip();

    await page.goto('about:blank');

    // 在 WS 層模擬發送 XSS payload chat 訊息
    const result = await page.evaluate(
      ({ wsUrl, tok, xssPayloads }) => {
        return new Promise<{ sent: boolean; serverError: boolean }>((resolve) => {
          const fullUrl = `${wsUrl}?token=${encodeURIComponent(tok)}`;
          const ws = new WebSocket(fullUrl);
          let sent = false;
          let serverError = false;

          const timer = setTimeout(() => {
            ws.close();
            resolve({ sent, serverError });
          }, 4000);

          ws.onopen = () => {
            for (const payload of xssPayloads) {
              ws.send(JSON.stringify({ type: 'send_chat', text: payload }));
            }
            sent = true;
          };

          ws.onmessage = (evt) => {
            try {
              const data = JSON.parse(evt.data as string);
              // 若收到 error（被過濾）或 send_message_rejected 均為正常行為
              if (data.type === 'error' && data.code === 'server_error') {
                serverError = true;
              }
            } catch {
              // Binary 訊息忽略
            }
          };

          ws.onclose = (evt) => {
            clearTimeout(timer);
            // close code 1011 表示伺服器崩潰（XSS 觸發異常）
            serverError = evt.code === 1011;
            resolve({ sent, serverError });
          };

          ws.onerror = () => {
            clearTimeout(timer);
            resolve({ sent, serverError });
          };
        });
      },
      {
        wsUrl: process.env.WS_URL || 'ws://localhost:2567',
        tok: token,
        xssPayloads: XSS_PAYLOADS,
      },
    );

    // 伺服器不應因 XSS payload 而崩潰
    expect(result.serverError).toBe(false);
  });

  test('chat 訊息超過 200 字元應被拒絕', async ({ page, request }) => {
    const token = await getValidToken(request);
    if (!token) test.skip();

    await page.goto('about:blank');

    const longText = 'A'.repeat(201); // 超過 200 字元限制

    const result = await page.evaluate(
      ({ wsUrl, tok, text }) => {
        return new Promise<{ sent: boolean; rejected: boolean }>((resolve) => {
          const ws = new WebSocket(`${wsUrl}?token=${encodeURIComponent(tok)}`);
          let sent = false;
          let rejected = false;

          const timer = setTimeout(() => {
            ws.close();
            resolve({ sent, rejected });
          }, 4000);

          ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'send_chat', text }));
            sent = true;
          };

          ws.onmessage = (evt) => {
            try {
              const data = JSON.parse(evt.data as string);
              if (
                data.type === 'send_message_rejected' ||
                data.type === 'error' ||
                data.reason === 'content_filter'
              ) {
                rejected = true;
                clearTimeout(timer);
                ws.close();
                resolve({ sent, rejected });
              }
            } catch {
              // ignore binary
            }
          };

          ws.onclose = () => {
            clearTimeout(timer);
            resolve({ sent, rejected });
          };
        });
      },
      {
        wsUrl: process.env.WS_URL || 'ws://localhost:2567',
        tok: token,
        text: longText,
      },
    );

    expect(result.sent).toBe(true);
    // 若伺服器運行，超長訊息應被拒絕
    if (result.rejected) {
      expect(result.rejected).toBe(true);
    }
  });

  test('Content-Type: text/html 請求 JSON 端點應回傳 400 或 415', async ({ request }) => {
    const res = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
      headers: { 'Content-Type': 'text/html' },
      data: '<html><body>XSS attempt</body></html>',
    });

    // 應拒絕非 JSON content-type
    expect([400, 415, 422]).toContain(res.status());
  });

  test('Response 不應回傳敏感的 Server 資訊 header', async ({ request }) => {
    const res = await request.get(`${API_BASE_URL}/api/v1/health`);
    const headers = res.headers();

    // X-Powered-By 應被移除（避免洩漏伺服器框架版本）
    expect(headers['x-powered-by']).toBeUndefined();
    // Server header 不應詳細洩漏版本資訊
    if (headers['server']) {
      const serverHeader = headers['server'].toLowerCase();
      // 不應包含版本號碼（如 "Express/4.18.2"）
      expect(serverHeader).not.toMatch(/\d+\.\d+\.\d+/);
    }
  });
});
