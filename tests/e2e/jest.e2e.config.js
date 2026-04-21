/**
 * Jest E2E configuration for server WebSocket tests.
 *
 * IMPORTANT: Requires a running Colyseus server on port 2567 OR
 * the tests spin up an in-process server themselves (preferred for CI).
 *
 * Run: npx jest --config tests/e2e/jest.e2e.config.js
 * Or add to package.json scripts: "test:e2e": "jest --config tests/e2e/jest.e2e.config.js"
 */

/** @type {import('jest').Config} */
module.exports = {
  displayName: 'e2e',
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/*.e2e.test.ts', '**/server_e2e.test.ts'],

  // WebSocket handshake + game round can take up to 30s
  testTimeout: 30000,

  // Sequential — avoids port conflicts when tests spin up their own server
  maxWorkers: 1,

  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          // Loose tsconfig for test helpers; production code uses server/tsconfig.json
          target: 'ES2020',
          module: 'CommonJS',
          esModuleInterop: true,
          resolveJsonModule: true,
          strict: false,
        },
      },
    ],
  },

  globals: {
    E2E_SERVER_PORT: 2567,
  },
};
