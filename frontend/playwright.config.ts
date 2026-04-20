import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;

if (!baseURL) {
  throw new Error(
    'PLAYWRIGHT_BASE_URL must be set to run real backend tests.\n' +
    'Example: PLAYWRIGHT_BASE_URL=http://localhost:5173/ npm run test:e2e',
  );
}

export default defineConfig({
  testDir: './e2e',
  timeout: 10_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: baseURL.endsWith('/') ? baseURL : `${baseURL}/`,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' } },
  ],
});
