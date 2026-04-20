import { expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const OTP_BYPASS_CODE = process.env.OTP_BYPASS_CODE ?? '000000';

export function normalizeURL(url?: string) {
  if (!url) {
    return "";
  }
  const { origin, pathname } = new URL(url);
  return origin + (pathname === '/' ? '' : pathname.replace(/\/$/, ''));
}

export async function login(page: Page): Promise<void> {
  const email = `delivered+${Date.now()}-${randomUUID()}@resend.dev`;

  await page.goto('/');
  await page.getByRole('button', { name: 'Sign In to Sync' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send login code' }).click();
  await page.getByLabel('Login code').fill(OTP_BYPASS_CODE);
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}