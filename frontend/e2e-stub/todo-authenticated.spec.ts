import { expect, test, type Page } from '@playwright/test';
import { stubAnonymousMode, stubAuthenticatedMode, TEST_USER } from './fixtures';

const LOCAL_STORAGE_KEY = 'tfcd_todos';

async function gotoTodoPage(page: Page): Promise<void> {
  await stubAuthenticatedMode(page);
  await page.goto('/');
  await expect(page.getByLabel('New todo title')).toBeVisible();
}

async function createTodo(page: Page, title: string): Promise<void> {
  const input = page.getByLabel('New todo title');
  await input.click();
  await input.fill(title);
  await page.getByLabel('Add todo').click();
  await expect(page.locator('.todo-item', { hasText: title })).toBeVisible();
}

test.describe('authenticated user', () => {
  test('no anonymous mode banner is shown', async ({ page }) => {
    await gotoTodoPage(page);

    await expect(page.getByRole('alert')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In to Sync' })).not.toBeVisible();
  });

  test('user name and sign out button are shown in header', async ({ page }) => {
    await gotoTodoPage(page);

    await expect(page.locator('.user-name')).toHaveText(TEST_USER.name);
    // Placeholder avatar shows first letter when no picture URL is provided
    await expect(page.locator('.user-avatar--placeholder')).toHaveText(
      TEST_USER.name.charAt(0).toUpperCase(),
    );
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  test('todos are stored via API, not localStorage', async ({ page }) => {
    await gotoTodoPage(page);

    await createTodo(page, 'API synced task');

    const localTodos = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    }, LOCAL_STORAGE_KEY);

    // Authenticated todos go to the API — local storage key should be absent or empty
    expect(localTodos).toHaveLength(0);
  });
});

test.describe('login page', () => {
  test('shows email login and anonymous options', async ({ page }) => {
    await stubAnonymousMode(page);
    await page.goto('/login');

    await expect(page.getByRole('button', { name: 'Send login code' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue without account' })).toBeVisible();
  });

  test('continuing without account navigates to the todo page', async ({ page }) => {
    await stubAnonymousMode(page);
    await page.goto('/login');

    await page.getByRole('button', { name: 'Continue without account' }).click();

    await expect(page.getByLabel('New todo title')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('anonymous mode');
  });

  test('submitting email advances to code step', async ({ page }) => {
    await stubAnonymousMode(page);
    await page.route('**/api/auth/otp/request', (route) =>
      route.fulfill({ status: 202, contentType: 'application/json', body: '{"detail":"Code sent"}' }),
    );
    await page.goto('/login');

    await page.getByLabel('Email').fill('user@example.com');
    await page.getByRole('button', { name: 'Send login code' }).click();

    await expect(page.getByLabel('Login code')).toBeVisible();
    await expect(page.getByText('user@example.com')).toBeVisible();
  });

  test('valid code logs in and navigates to todo page', async ({ page }) => {
    await stubAnonymousMode(page);
    await page.route('**/api/auth/otp/request', (route) =>
      route.fulfill({ status: 202, contentType: 'application/json', body: '{"detail":"Code sent"}' }),
    );
    await page.route('**/api/auth/otp/verify', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: 'test-token', user: TEST_USER }),
      }),
    );
    await page.route('**/api/todo/todos', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.goto('/login');

    await page.getByLabel('Email').fill('user@example.com');
    await page.getByRole('button', { name: 'Send login code' }).click();
    await page.getByLabel('Login code').fill('123456');
    await page.getByRole('button', { name: 'Verify code' }).click();

    await expect(page.getByLabel('New todo title')).toBeVisible();
  });

  test('invalid code shows error message', async ({ page }) => {
    await stubAnonymousMode(page);
    await page.route('**/api/auth/otp/request', (route) =>
      route.fulfill({ status: 202, contentType: 'application/json', body: '{"detail":"Code sent"}' }),
    );
    await page.route('**/api/auth/otp/verify', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{"detail":"Invalid or expired code"}',
      }),
    );
    await page.goto('/login');

    await page.getByLabel('Email').fill('user@example.com');
    await page.getByRole('button', { name: 'Send login code' }).click();
    await page.getByLabel('Login code').fill('000000');
    await page.getByRole('button', { name: 'Verify code' }).click();

    await expect(page.getByRole('alert')).toContainText('Invalid or expired code');
    await expect(page.getByLabel('Login code')).toBeVisible();
  });

  test('change email button returns to email step', async ({ page }) => {
    await stubAnonymousMode(page);
    await page.route('**/api/auth/otp/request', (route) =>
      route.fulfill({ status: 202, contentType: 'application/json', body: '{"detail":"Code sent"}' }),
    );
    await page.goto('/login');

    await page.getByLabel('Email').fill('user@example.com');
    await page.getByRole('button', { name: 'Send login code' }).click();
    await expect(page.getByLabel('Login code')).toBeVisible();

    await page.getByRole('button', { name: 'Change email' }).click();

    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Login code')).not.toBeVisible();
  });
});
