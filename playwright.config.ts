import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright 設定檔 — Sam Gong 三公遊戲 E2E 自動化測試
 * STEP-23: RPA E2E Automation (Playwright)
 *
 * 測試策略分兩層：
 * 1. REST API 自動化（Playwright HTTP request / fetch）
 * 2. WebSocket 流程測試（Playwright WebSocket API）
 *
 * 執行方式：
 *   npx playwright test                          # 全部測試
 *   npx playwright test tests/e2e/api_smoke_test # 單一 spec
 *   BASE_URL=https://staging.samgong.io npx playwright test
 */
export default defineConfig({
  testDir: './tests/e2e',

  /* 每個測試的最大執行時間（ms） */
  timeout: 30_000,

  /* 全域設定：expect 逾時 */
  expect: {
    timeout: 10_000,
  },

  /* 完整錯誤報告 */
  fullyParallel: true,

  /* CI 環境下禁止 `.only` 測試 */
  forbidOnly: !!process.env.CI,

  /* 失敗重試次數（CI 環境重試 1 次） */
  retries: process.env.CI ? 1 : 0,

  /* 並行 worker 數（CI 環境減少並行度避免 Rate Limit 誤判） */
  workers: process.env.CI ? 2 : undefined,

  /* 報告格式 */
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'playwright-report/results.xml' }],
  ],

  /* 全域 use 設定 */
  use: {
    /* 基礎 URL — 可透過環境變數覆蓋 */
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    /* REST API 測試：所有 request 都帶 JSON Content-Type */
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
      'X-Request-ID': 'playwright-e2e-test',
    },

    /* 追蹤設定：僅在第一次重試時收集 */
    trace: 'on-first-retry',

    /* 截圖：僅在測試失敗時儲存 */
    screenshot: 'only-on-failure',

    /* 影片：僅在測試失敗時儲存 */
    video: 'on-first-retry',

    /* 忽略 HTTPS 憑證錯誤（staging 環境可能使用自簽憑證） */
    ignoreHTTPSErrors: process.env.IGNORE_HTTPS_ERRORS === 'true',
  },

  /* 測試 projects */
  projects: [
    /* REST API 測試 — 不需要瀏覽器 */
    {
      name: 'api-tests',
      testMatch: ['**/api_smoke_test.spec.ts', '**/security_tests.spec.ts'],
      use: {
        // API 測試不需要特定瀏覽器，使用最輕量設定
        ...devices['Desktop Chrome'],
      },
    },

    /* WebSocket 與完整流程測試 — 需要瀏覽器環境 */
    {
      name: 'chromium',
      testMatch: ['**/websocket_flow.spec.ts', '**/anti_addiction_flow.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        /* WebSocket 測試需要完整瀏覽器環境 */
        headless: true,
      },
    },

    /* 全功能回歸測試（所有 spec） */
    {
      name: 'full-regression',
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
      },
    },
  ],

  /* 測試前全局 setup（可選：啟動 mock server） */
  // globalSetup: './tests/e2e/global-setup.ts',

  /* 測試後全局 teardown */
  // globalTeardown: './tests/e2e/global-teardown.ts',

  /* 輸出目錄 */
  outputDir: 'playwright-results',
});
