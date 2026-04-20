import { expect, test } from '@playwright/test';

import { login, normalizeURL } from './helpers';

const OTP_BYPASS_CODE = process.env.OTP_BYPASS_CODE ?? '000000';

// Compute a wrong code by incrementing the bypass code by 1 (mod 1000000)
const wrongCode = String((Number(OTP_BYPASS_CODE) + 1) % 1_000_000).padStart(6, '0');

// Auth flow tests start unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('OTP login flow', () => {
  test('full login flow lands on todo page', async ({ page }) => {
    const email = `delivered+${Date.now()}@resend.dev`;

    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send login code' }).click();

    await expect(page.getByLabel('Login code')).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    await page.getByLabel('Login code').fill(OTP_BYPASS_CODE);
    await page.getByRole('button', { name: 'Verify code' }).click();

    await expect(page.getByLabel('New todo title')).toBeVisible();
  });

  test('wrong code shows error and stays on code step', async ({ page }) => {
    const email = `delivered+${Date.now()}@resend.dev`;

    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send login code' }).click();

    await page.getByLabel('Login code').fill(wrongCode);
    await page.getByRole('button', { name: 'Verify code' }).click();

    await expect(page.getByRole('alert')).toContainText('Invalid or expired code');
    await expect(page.getByLabel('Login code')).toBeVisible();
  });
});

test.describe('session management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('session persists after page reload', async ({ page }) => {
    await expect(page.getByLabel('New todo title')).toBeVisible();

    await page.reload();

    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(page.getByLabel('New todo title')).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('sign out redirects to home page', async ({ page }, testInfo) => {
    await page.getByRole('button', { name: 'Sign out' }).click();

    expect(normalizeURL(page.url())).toBe(normalizeURL(testInfo.project.use.baseURL));
    await expect(page.getByRole('button', { name: 'Sign out' })).not.toBeVisible();
  });
});
