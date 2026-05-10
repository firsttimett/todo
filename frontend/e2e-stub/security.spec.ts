import { expect, test, type Page } from '@playwright/test';

import { stubAnonymousMode, stubAuthenticatedMode } from './fixtures';

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

test.describe('security policy runtime checks', () => {
  test('anonymous and authenticated flows do not emit CSP violations', async ({ page }) => {
    const violations = collectSecurityPolicyViolations(page);

    await stubAnonymousMode(page);
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue without account' }).click();
    await expect(page.getByLabel('New todo title')).toBeVisible();

    const localTitle = `Local CSP check ${Date.now()}`;
    await page.getByLabel('New todo title').fill(localTitle);
    await page.getByLabel('Add todo').click();
    await expect(page.locator('.todo-item', { hasText: localTitle })).toBeVisible();

    await stubAuthenticatedMode(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

    expect(violations).toEqual([]);
  });
});
