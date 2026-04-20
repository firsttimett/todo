import { type Page } from '@playwright/test';

export const TEST_USER = {
  id: 'test-user-id',
  name: 'Test User',
  email: 'test@example.com',
  picture: '',
};

export async function stubAnonymousMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const anonymousModeFlag = 'tfcd-anonymous-mode';
    if (window.name !== anonymousModeFlag) {
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.name = anonymousModeFlag;
    }
  });

  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: '{}',
    });
  });

  await page.route('**/api/auth/logout', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    });
  });
}

export async function stubAuthenticatedMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    // Trigger auth init to call /api/auth/refresh on mount
    window.localStorage.setItem('tfcd_auth_refresh_hint', '1');
  });

  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: 'test-token', user: TEST_USER }),
    });
  });

  // /api/todo/todos/:id must be registered before /api/todo/todos to take precedence
  await page.route('**/api/todo/todos/**', async (route) => {
    const method = route.request().method();
    if (method === 'PATCH') {
      const body = route.request().postDataJSON() ?? {};
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    } else if (method === 'DELETE') {
      await route.fulfill({ status: 204, body: '' });
    } else {
      await route.continue();
    }
  });

  await page.route('**/api/todo/todos', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    } else if (method === 'POST') {
      const body = route.request().postDataJSON() ?? {};
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: `server-${Date.now()}`, ...body }),
      });
    } else {
      await route.continue();
    }
  });

  await page.route('**/api/auth/logout', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    });
  });
}

export function formatLocalDate(offsetDays = 0): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatLocalDateTime(offsetDays = 0, hour = 9, minute = 30): string {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, minute, 0, 0);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
