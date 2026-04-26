/**
 * Playwright configuration for MOBO E2E tests
 *
 * Docs: https://playwright.dev/docs/test-configuration
 */
'use strict';

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',   // relative to this config file — resolves to tests/e2e/
  fullyParallel: false,          // ride/payment tests share DB state — run serially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,                    // single worker to prevent DB race conditions
  reporter: [
    ['html', { outputFolder: 'tests/e2e/playwright-report', open: 'never' }],
    ['list'],
  ],
  timeout: 30_000,               // 30s per test
  expect: { timeout: 8_000 },

  use: {
    baseURL:       process.env.BASE_URL || 'http://localhost:3005',
    trace:         'on-first-retry',
    screenshot:    'only-on-failure',
    video:         'retain-on-failure',
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Uncomment for cross-browser:
    // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // { name: 'Mobile Safari', use: { ...devices['iPhone 13'] } },
  ],

  // Spin up the admin dashboard before running tests (optional — comment out
  // if the stack is already running via docker-compose)
  // webServer: {
  //   command: 'cd admin && npm start',
  //   port: 3005,
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 30_000,
  // },
});
