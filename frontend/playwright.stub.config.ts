import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || '4173');
const host = process.env.PLAYWRIGHT_HOST || '127.0.0.1';
const localBaseURL = `http://${host}:${port}`;
// When targeting a deployed environment, set PLAYWRIGHT_BASE_URL to the full URL.
// The local dev server will not be started in that case.
// Always ensure a trailing slash so that page.goto('') resolves to the app root
// rather than the origin root (critical for GCS bucket URLs like
// https://storage.googleapis.com/BUCKET_NAME).
const rawBaseURL = process.env.PLAYWRIGHT_BASE_URL ?? localBaseURL;
const baseURL = rawBaseURL.endsWith('/') ? rawBaseURL : `${rawBaseURL}/`;

// In CI, serve the production build (dist/) via vite preview so tests run
// against the same artifact that was deployed. Locally, use the dev server
// so there's no need to build before running tests.
const webServerCommand = process.env.PLAYWRIGHT_SERVE_DIST
  ? `npm run preview -- --host ${host} --port ${port}`
  : `npm run dev -- --host ${host} --port ${port}`;

export default defineConfig({
  testDir: './e2e-stub',
  timeout: 10_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium', use: { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' } },
    { name: 'webkit' },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: webServerCommand,
        url: localBaseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
