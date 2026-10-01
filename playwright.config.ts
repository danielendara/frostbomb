import { defineConfig, devices } from '@playwright/test';

// FROSTBOMB_E2E=smoke (default CI) | full (on-demand full chromium suite)
const e2eMode = process.env.FROSTBOMB_E2E ?? 'smoke';

const smokeProject = {
  name: 'sequential-smoke',
  use: { ...devices['Desktop Chrome'] },
  testMatch: '**/*.smoke.spec.ts',
  testIgnore: ['**/unit/**'],
  fullyParallel: false,
  workers: 1,
};

const chromiumProject = {
  name: 'chromium',
  use: { ...devices['Desktop Chrome'] },
  testIgnore: ['**/unit/**', '**/*.smoke.spec.ts'],
};

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/unit/**', '**/e2e-helpers.ts'],
  forbidOnly: !!process.env.CI,
  timeout: 60000,
  maxFailures: process.env.CI ? 5 : undefined,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
  projects: e2eMode === 'full' ? [chromiumProject, smokeProject] : [smokeProject],
});
