import { expect, test, type Page } from '@playwright/test';

import { login } from './helpers';

const EXPECTED_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "require-trusted-types-for 'script'",
].join('; ');

function collectSecurityPolicyViolations(page: Page): string[] {
  const violations: string[] = [];
  const pattern = /content security policy|security-policy|violates.*policy|refused to .* because it violates/i;

  page.on('console', (message) => {
    const text = message.text();
    if (pattern.test(text)) {
      violations.push(`[${message.type()}] ${text}`);
    }
  });

  page.on('pageerror', (error) => {
    if (pattern.test(error.message)) {
      violations.push(`[pageerror] ${error.message}`);
    }
  });

  return violations;
}

function expectStrictTransportSecurity(header: string | undefined): void {
  expect(header).not.toBeUndefined();

  const hsts = header ?? '';
  const directives = new Map(
    hsts.split(';').map((directive) => {
      const [name, value = ''] = directive.trim().split('=', 2);
      return [name.toLowerCase(), value];
    }),
  );

  const maxAgeDirective = directives.get('max-age');
  expect(maxAgeDirective).not.toBeUndefined();

  const maxAge = Number(maxAgeDirective);
  expect(maxAge).toBeGreaterThanOrEqual(31536000);
  expect(directives.has('includesubdomains')).toBe(true);
}

test.describe('security headers and CSP', () => {
  test('Firebase Hosting responses enforce expected security headers', async ({ page }, testInfo) => {
    const baseURL = String(testInfo.project.use.baseURL ?? '');
    test.skip(new URL(baseURL).protocol !== 'https:', 'Security headers are verified on deployed HTTPS targets.');

    const response = await page.goto('/');
    expect(response).not.toBeNull();

    const headers = response!.headers();
    expect(headers['content-security-policy']).toBe(EXPECTED_CSP);
    expect(headers['content-security-policy-report-only']).toBeUndefined();
    expectStrictTransportSecurity(headers['strict-transport-security']);
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toBe(
      'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    );
  });

  test('login and todo flows do not produce CSP violations', async ({ page }) => {
    const violations = collectSecurityPolicyViolations(page);

    await login(page);

    const title = `CSP clean todo ${Date.now()}`;
    await page.getByLabel('New todo title').fill(title);
    await page.getByLabel('Add todo').click();
    await expect(page.locator('.todo-item', { hasText: title })).toBeVisible();

    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Send login code' })).toBeVisible();

    expect(violations).toEqual([]);
  });
});
