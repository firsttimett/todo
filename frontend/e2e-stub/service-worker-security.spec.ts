import { expect, test, type Page } from '@playwright/test';

import { stubAnonymousMode } from './fixtures';

// Refers to firebase.json.tpl for source of truth
const FIREBASE_CSP = [
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
  'trusted-types nnow-sw',
  "require-trusted-types-for 'script'",
].join('; ');

function collectServiceWorkerSecurityErrors(page: Page): string[] {
  const errors: string[] = [];
  const pattern =
    /content security policy|security-policy|trustedscripturl|trusted types|serviceworker|service worker|failed to execute 'register'|violates.*policy|refused to .* because it violates/i;

  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') {
      return;
    }

    const text = message.text();
    if (pattern.test(text)) {
      errors.push(`[${message.type()}] ${text}`);
    }
  });

  page.on('pageerror', (error) => {
    if (pattern.test(error.message)) {
      errors.push(`[pageerror] ${error.message}`);
    }
  });

  return errors;
}

async function injectFirebaseCsp(page: Page): Promise<void> {
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') {
      await route.continue();
      return;
    }

    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        'content-security-policy': FIREBASE_CSP,
      },
    });
  });
}

test.use({ serviceWorkers: 'allow' });

test.describe('service worker security policy', () => {
  test('registers the service worker under Trusted Types CSP', async ({ page }) => {
    test.skip(
      process.env.PLAYWRIGHT_SERVE_DIST !== 'true',
      'Service worker registration requires the production build served from dist/.',
    );

    await stubAnonymousMode(page);
    await injectFirebaseCsp(page);

    const errors = collectServiceWorkerSecurityErrors(page);

    await page.goto('/');
    await expect(page.getByLabel('New todo title')).toBeVisible();

    await expect
      .poll(async () => {
        return page.evaluate(async () => {
          const registrations = await navigator.serviceWorker.getRegistrations();
          return registrations.some((registration) => {
            const scriptURL =
              registration.active?.scriptURL ??
              registration.installing?.scriptURL ??
              registration.waiting?.scriptURL ??
              '';

            return scriptURL !== '' && new URL(scriptURL).pathname === '/sw.js';
          });
        });
      })
      .toBe(true);

    expect(errors).toEqual([]);
  });
});
