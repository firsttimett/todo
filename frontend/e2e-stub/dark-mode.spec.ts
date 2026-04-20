import { expect, test, type Page } from '@playwright/test';
import { stubAnonymousMode } from './fixtures';

const DARK_MODE_STORAGE_KEY = 'tfcd_dark_mode';

async function gotoTodoPage(page: Page): Promise<void> {
  await stubAnonymousMode(page);
  await page.goto('/');
  await expect(page.getByLabel('New todo title')).toBeVisible();
}

test.describe('dark mode toggle', () => {
  test('toggles dark class on html element', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await gotoTodoPage(page);

    await expect(page.locator('html')).not.toHaveClass(/dark/);

    await page.getByLabel('Switch to dark mode').click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByLabel('Switch to light mode')).toBeVisible();

    await page.getByLabel('Switch to light mode').click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('persists dark mode preference across reloads', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await gotoTodoPage(page);

    await page.getByLabel('Switch to dark mode').click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    const stored = await page.evaluate((key) => localStorage.getItem(key), DARK_MODE_STORAGE_KEY);
    expect(stored).toBe('true');

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByLabel('Switch to light mode')).toBeVisible();
  });

  test('persists light mode preference across reloads', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await gotoTodoPage(page);

    await page.getByLabel('Switch to light mode').click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    const stored = await page.evaluate((key) => localStorage.getItem(key), DARK_MODE_STORAGE_KEY);
    expect(stored).toBe('false');

    await page.reload();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await expect(page.getByLabel('Switch to dark mode')).toBeVisible();
  });

  test('shows correct icon for current mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await gotoTodoPage(page);

    const toggleBtn = page.locator('.dark-mode-toggle');
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn.locator('svg')).toBeVisible();

    // Switch to dark mode
    await toggleBtn.click();
    await expect(toggleBtn.locator('svg')).toBeVisible();
  });
});
