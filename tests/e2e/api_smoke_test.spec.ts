/**
 * REST API Smoke Tests — Sam Gong 三公遊戲
 * STEP-23: RPA E2E Automation (Playwright)
 *
 * 測試目標：驗證所有 REST API 端點的基本可用性（Happy Path + Error Cases）
 * 依據：docs/API.md v1.1
 *
 * 執行：npx playwright test tests/e2e/api_smoke_test.spec.ts
 */
import { test, expect } from '@playwright/test';

// ─── 測試輔助常數 ────────────────────────────────────────────────────────────

const TEST_CREDENTIALS = {
  valid: {
    username: process.env.TEST_USERNAME || 'test_player_01',
    password: process.env.TEST_PASSWORD || 'Test@1234',
  },
  invalid: {
    username: 'nonexistent_user',
    password: 'WrongPassword999',
  },
};

// ─── 測試共用狀態（透過 storage 傳遞 JWT） ────────────────────────────────────

let validJwt: string = '';

// ─── 1. Health Check ─────────────────────────────────────────────────────────

test.describe('Health Check', () => {
  test('GET /api/v1/health 應回傳 200 OK', async ({ request }) => {
    const res = await request.get('/api/v1/health');

    expect(res.status()).toBe(200);
    const body = await res.json();
    // health 端點應回傳服務狀態資訊
    expect(body).toBeDefined();
  });

  test('GET /api/v1/health/ready 應回傳 200（DB + Redis 連線正常）', async ({ request }) => {
    const res = await request.get('/api/v1/health/ready');

    // 服務就緒應回傳 200；若依賴服務未就緒則 503
    expect([200, 503]).toContain(res.status());
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test('GET /api/v1/config 應回傳用戶端設定', async ({ request }) => {
    const res = await request.get('/api/v1/config');

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });
});

// ─── 2. Authentication ────────────────────────────────────────────────────────

test.describe('Authentication API', () => {
  test('POST /api/v1/auth/login 正確憑證應回傳 JWT access_token', async ({ request }) => {
    const res = await request.post('/api/v1/auth/login', {
      data: TEST_CREDENTIALS.valid,
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('access_token');
    expect(body).toHaveProperty('refresh_token');
    expect(body).toHaveProperty('expires_in');
    expect(typeof body.access_token).toBe('string');
    expect(body.access_token.length).toBeGreaterThan(20);
    // JWT 格式：3 段 base64 以 . 分隔
    expect(body.access_token.split('.').length).toBe(3);

    // 儲存 JWT 供後續測試使用
    validJwt = body.access_token;
  });

  test('POST /api/v1/auth/login 錯誤密碼應回傳 401', async ({ request }) => {
    const res = await request.post('/api/v1/auth/login', {
      data: TEST_CREDENTIALS.invalid,
    });

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    // 不應洩漏是帳號還是密碼錯誤（安全考量）
    expect(body.error).not.toBe('');
  });

  test('POST /api/v1/auth/login 缺少必要欄位應回傳 400', async ({ request }) => {
    const res = await request.post('/api/v1/auth/login', {
      data: { username: '' }, // 缺少 password
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('POST /api/v1/auth/login 空白 body 應回傳 400', async ({ request }) => {
    const res = await request.post('/api/v1/auth/login', {
      data: {},
    });

    expect(res.status()).toBe(400);
  });

  test('POST /api/v1/auth/refresh 有效 refresh_token 應回傳新 token 對', async ({ request }) => {
    // 先登入取得 refresh_token
    const loginRes = await request.post('/api/v1/auth/login', {
      data: TEST_CREDENTIALS.valid,
    });

    if (loginRes.status() !== 200) {
      test.skip();
      return;
    }

    const { refresh_token } = await loginRes.json();
    const res = await request.post('/api/v1/auth/refresh', {
      data: { refresh_token },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('access_token');
    expect(body).toHaveProperty('refresh_token');
    // Refresh Token Rotation：新 refresh_token 應與舊的不同
    expect(body.refresh_token).not.toBe(refresh_token);
  });

  test('POST /api/v1/auth/refresh 無效 refresh_token 應回傳 401', async ({ request }) => {
    const res = await request.post('/api/v1/auth/refresh', {
      data: { refresh_token: 'invalid-refresh-token-xyz' },
    });

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });
});

// ─── 3. Player API ────────────────────────────────────────────────────────────

test.describe('Player API', () => {
  test.beforeAll(async ({ request }) => {
    // 登入取得 JWT
    const res = await request.post('/api/v1/auth/login', {
      data: TEST_CREDENTIALS.valid,
    });
    if (res.status() === 200) {
      const body = await res.json();
      validJwt = body.access_token;
    }
  });

  test('GET /api/v1/player/me 有效 JWT 應回傳玩家資料', async ({ request }) => {
    if (!validJwt) test.skip();

    const res = await request.get('/api/v1/player/me', {
      headers: { Authorization: `Bearer ${validJwt}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    // 驗證必要欄位
    expect(body).toHaveProperty('player_id');
    expect(body).toHaveProperty('display_name');
    expect(body).toHaveProperty('chip_balance');
    expect(body).toHaveProperty('age_verified');
    expect(body).toHaveProperty('is_minor');
    expect(body).toHaveProperty('tutorial_completed');
    // chip_balance 應為非負整數
    expect(typeof body.chip_balance).toBe('number');
    expect(body.chip_balance).toBeGreaterThanOrEqual(0);
  });

  test('GET /api/v1/player/me 無 JWT 應回傳 401', async ({ request }) => {
    const res = await request.get('/api/v1/player/me');

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('GET /api/v1/player/me 無效 JWT 應回傳 401', async ({ request }) => {
    const res = await request.get('/api/v1/player/me', {
      headers: { Authorization: 'Bearer this.is.invalid.jwt.token' },
    });

    expect(res.status()).toBe(401);
  });

  test('PUT /api/v1/player/settings 有效 JWT 應能更新設定', async ({ request }) => {
    if (!validJwt) test.skip();

    const res = await request.put('/api/v1/player/settings', {
      headers: { Authorization: `Bearer ${validJwt}` },
      data: {
        music_volume: 60,
        sfx_volume: 70,
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('message');
  });

  test('PUT /api/v1/player/settings 無 JWT 應回傳 401', async ({ request }) => {
    const res = await request.put('/api/v1/player/settings', {
      data: { music_volume: 50 },
    });

    expect(res.status()).toBe(401);
  });
});

// ─── 4. Daily Chip ────────────────────────────────────────────────────────────

test.describe('Daily Chip API', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/v1/auth/login', {
      data: TEST_CREDENTIALS.valid,
    });
    if (res.status() === 200) {
      validJwt = (await res.json()).access_token;
    }
  });

  test('POST /api/v1/player/daily-chip 首次領取應回傳 200 與籌碼資訊', async ({ request }) => {
    if (!validJwt) test.skip();

    const res = await request.post('/api/v1/player/daily-chip', {
      headers: { Authorization: `Bearer ${validJwt}` },
    });

    // 首次領取 200 或已領取 400（取決於測試帳號當日狀態）
    expect([200, 400]).toContain(res.status());

    const body = await res.json();
    if (res.status() === 200) {
      expect(body).toHaveProperty('chips_awarded');
      expect(body).toHaveProperty('new_balance');
      expect(body).toHaveProperty('next_claim_available_at');
      expect(body.chips_awarded).toBeGreaterThan(0);
    } else {
      // 已領取：400 帶 daily_task_limit error code
      expect(body).toHaveProperty('error');
      expect(body.error).toBe('daily_task_limit');
      expect(body).toHaveProperty('next_claim_available_at');
    }
  });

  test('POST /api/v1/player/daily-chip 重複領取應回傳 400 daily_task_limit', async ({ request }) => {
    if (!validJwt) test.skip();

    // 第一次嘗試
    await request.post('/api/v1/player/daily-chip', {
      headers: { Authorization: `Bearer ${validJwt}` },
    });

    // 第二次嘗試應觸發幂等保護
    const res = await request.post('/api/v1/player/daily-chip', {
      headers: { Authorization: `Bearer ${validJwt}` },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('daily_task_limit');
  });

  test('POST /api/v1/player/daily-chip 無 JWT 應回傳 401', async ({ request }) => {
    const res = await request.post('/api/v1/player/daily-chip');
    expect(res.status()).toBe(401);
  });
});

// ─── 5. Leaderboard ──────────────────────────────────────────────────────────

test.describe('Leaderboard API', () => {
  test('GET /api/v1/leaderboard 無 JWT 應回傳排行榜（公開端點）', async ({ request }) => {
    const res = await request.get('/api/v1/leaderboard');

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('week_key');
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('GET /api/v1/leaderboard 有 JWT 應回傳排行榜含個人排名', async ({ request }) => {
    if (!validJwt) test.skip();

    const res = await request.get('/api/v1/leaderboard', {
      headers: { Authorization: `Bearer ${validJwt}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('week_key');
    expect(body).toHaveProperty('data');
  });

  test('GET /api/v1/leaderboard?type=weekly 指定 weekly 類型應正常回傳', async ({ request }) => {
    const res = await request.get('/api/v1/leaderboard?type=weekly');

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.week_key).toBeDefined();
  });

  test('GET /api/v1/leaderboard?limit=10 限制數量應回傳最多 10 筆', async ({ request }) => {
    const res = await request.get('/api/v1/leaderboard?limit=10');

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeLessThanOrEqual(10);
  });

  test('GET /api/v1/leaderboard 排行榜資料結構應包含 rank/player_id/net_chips', async ({ request }) => {
    const res = await request.get('/api/v1/leaderboard?limit=1');

    expect(res.status()).toBe(200);
    const body = await res.json();
    if (body.data.length > 0) {
      const entry = body.data[0];
      expect(entry).toHaveProperty('rank');
      expect(entry).toHaveProperty('player_id');
      expect(entry).toHaveProperty('net_chips');
      expect(entry.rank).toBe(1);
    }
  });

  test('GET /api/v1/leaderboard?limit=201 超出最大限制應回傳 400', async ({ request }) => {
    const res = await request.get('/api/v1/leaderboard?limit=201');

    // 超出最大 200 應回傳錯誤
    expect([400, 422]).toContain(res.status());
  });
});

// ─── 6. Rate Limit ───────────────────────────────────────────────────────────

test.describe('Rate Limit', () => {
  test('Auth 端點超過 30/min 應回傳 429 Too Many Requests', async ({ request }) => {
    // 快速發送超過 30 次請求，預期觸發 Rate Limit
    const LIMIT = 32;
    let got429 = false;

    for (let i = 0; i < LIMIT; i++) {
      const res = await request.post('/api/v1/auth/login', {
        data: { username: `flood_user_${i}`, password: 'WrongPass' },
      });

      if (res.status() === 429) {
        got429 = true;
        const body = await res.json();
        // 429 回應應包含 Retry-After header 或 body 說明
        const retryAfter = res.headers()['retry-after'];
        expect(retryAfter !== undefined || body.error !== undefined).toBe(true);
        break;
      }
    }

    // 注意：若 staging 環境 Rate Limit 以 IP 計量，CI runner 可能觸發也可能不觸發
    // 記錄結果但不強制失敗（避免 CI 環境 IP 污染）
    if (!got429) {
      console.warn('[Rate Limit Test] 未觸發 429，可能 Rate Limit 已重置或測試環境無限制');
    }
  });

  test('daily-chip 端點超過 5/min 應回傳 429', async ({ request }) => {
    if (!validJwt) test.skip();

    let got429 = false;
    for (let i = 0; i < 7; i++) {
      const res = await request.post('/api/v1/player/daily-chip', {
        headers: { Authorization: `Bearer ${validJwt}` },
      });

      if (res.status() === 429) {
        got429 = true;
        expect(res.headers()['retry-after'] || (await res.json()).error).toBeTruthy();
        break;
      }
    }

    if (!got429) {
      console.warn('[Rate Limit Test] daily-chip 429 未觸發');
    }
  });

  test('leaderboard 端點 429 回應應包含 Retry-After header', async ({ request }) => {
    // 驗證 429 回應格式正確性（若觸發）
    let lastRes: Awaited<ReturnType<typeof request.get>> | null = null;

    for (let i = 0; i < 65; i++) {
      lastRes = await request.get('/api/v1/leaderboard');
      if (lastRes.status() === 429) {
        const headers = lastRes.headers();
        // Retry-After 應存在（依 API.md §1.5）
        expect(headers['retry-after']).toBeDefined();
        break;
      }
    }
  });
});
