import { expect, test } from '@playwright/test';

import { login } from './helpers';

async function createTodo(page: import('@playwright/test').Page, title: string): Promise<void> {
  const input = page.getByLabel('New todo title');
  await input.click();
  await input.fill(title);
  await page.getByLabel('Add todo').click();
  await expect(page.locator('.todo-item', { hasText: title })).toBeVisible();
}

test.describe('todo persistence', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('created todo persists after reload', async ({ page }) => {
    const title = `Real todo ${Date.now()}`;
    await createTodo(page, title);

    await page.reload();

    await expect(page.locator('.todo-item', { hasText: title })).toBeVisible();
  });

  test('completed todo persists after reload', async ({ page }) => {
    const title = `Complete me ${Date.now()}`;
    await createTodo(page, title);

    const item = page.locator('.todo-item', { hasText: title });
    await page.getByRole('button', { name: 'Mark as complete' }).click();
    await expect(item).not.toBeVisible();

    await page.getByRole('button', { name: 'Completed' }).click();
    
    await expect(item).toHaveClass(/todo-item--completed/);
    await page.reload();
    await expect(item).toHaveClass(/todo-item--completed/);
  });

  test('deleted todo is gone after reload', async ({ page }) => {
    const title = `Delete me ${Date.now()}`;
    await createTodo(page, title);
    
    const item = page.locator('.todo-item', { hasText: title });
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(item).not.toBeVisible();

    await page.reload();

    await expect(item).not.toBeVisible();
  });
});

test.describe('anonymous mode', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('anonymous todos are stored locally and survive reload', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue without account' }).click();
    await page.getByLabel('New todo title').waitFor({ state: 'visible' });

    const title = `Local todo ${Date.now()}`;
    await createTodo(page, title);

    await page.reload();

    await expect(page.locator('.todo-item', { hasText: title })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('anonymous mode');
  });
});
