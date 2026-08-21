import { defineConfig, devices } from '@playwright/test';

/**
 * E2E test config for RealEstate Vault.
 *
 * Requires the dev workflows to be running:
 *  - artifacts/realestate-vault (web, served at http://localhost:80/)
 *  - artifacts/api-server (API, served at http://localhost:80/api)
 *
 * Run with: pnpm --filter @workspace/scripts run test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:80',
    trace: 'retain-on-failure',
    launchOptions: {
      // Replit provides a Nix-patched Chromium; fall back to Playwright's default.
      executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
