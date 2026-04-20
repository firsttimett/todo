import { expect, test, type Page } from '@playwright/test';
import { stubAnonymousMode } from './fixtures';

const WORKSPACE_STORAGE_KEY = 'tfcd_todo_workspace';

async function gotoTodoPage(page: Page): Promise<void> {
  await stubAnonymousMode(page);
  await page.goto('/');
  await expect(page.getByLabel('New todo title')).toBeVisible();
}

async function createTodo(
  page: Page,
  opts: { title: string; description?: string; priority?: string; deadline?: string; labels?: string },
): Promise<void> {
  const form = page.locator('.todo-input-form');
  const titleInput = form.getByLabel('New todo title');
  await titleInput.click();
  await titleInput.fill(opts.title);

  if (opts.description || opts.deadline || opts.priority || opts.labels) {
    await form.getByRole('button', { name: 'More details' }).click();
  }

  if (opts.description) {
    await form.getByLabel('Todo description').fill(opts.description);
  }

  if (opts.priority) {
    await form.getByLabel('Priority', { exact: true }).selectOption(opts.priority);
  }

  if (opts.deadline) {
    await form.getByLabel('Deadline', { exact: true }).fill(opts.deadline);
  }

  if (opts.labels) {
    await form.getByLabel('Labels', { exact: true }).fill(opts.labels);
  }

  await form.getByLabel('Add todo').click();
  await expect(page.locator('.todo-item', { hasText: opts.title })).toBeVisible();
}

test.describe('sidebar and workspace UI', () => {
  test('sidebar is visible on desktop and can be collapsed', async ({ page }) => {
    await gotoTodoPage(page);

    await expect(page.getByLabel('Workspace navigation')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Views', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Saved Views' })).toBeVisible();

    await page.getByLabel('Collapse sidebar').click();
    await expect(page.getByLabel('Expand workspace panel')).toBeVisible();

    await page.getByLabel('Expand workspace panel').click();
    await expect(page.getByLabel('Workspace navigation')).toBeVisible();
  });

  test('sidebar is hidden on mobile and can be toggled', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoTodoPage(page);

    await expect(page.getByLabel('Workspace navigation')).not.toBeVisible();

    await page.getByLabel('Expand workspace panel').click();
    await expect(page.getByLabel('Workspace navigation')).toBeVisible();

    await page.locator('.todo-sidebar-backdrop--visible').click();
    await expect(page.getByLabel('Workspace navigation')).not.toBeVisible();
  });

  test('search filters todos by title', async ({ page }) => {
    await gotoTodoPage(page);

    await createTodo(page, { title: 'Buy milk' });
    await createTodo(page, { title: 'Buy eggs' });
    await createTodo(page, { title: 'Walk dog' });

    const searchInput = page.getByRole('searchbox', { name: 'Search todos' });
    await searchInput.fill('milk');

    await expect(page.locator('.todo-item')).toHaveCount(1);
    await expect(page.getByText('Buy milk')).toBeVisible();
    await expect(page.getByText('Buy eggs')).not.toBeVisible();
  });

  test('search filters todos by description', async ({ page }) => {
    await gotoTodoPage(page);

    await createTodo(page, { title: 'Task A', description: 'Urgent follow-up needed' });
    await createTodo(page, { title: 'Task B', description: 'Routine maintenance' });

    const searchInput = page.getByRole('searchbox', { name: 'Search todos' });
    await searchInput.fill('follow-up');

    await expect(page.locator('.todo-item')).toHaveCount(1);
    await expect(page.getByText('Task A', { exact: true })).toBeVisible();
    await expect(page.getByText('Task B', { exact: true })).not.toBeVisible();
  });

  test('search clear button resets filter', async ({ page }) => {
    await gotoTodoPage(page);

    await createTodo(page, { title: 'Alpha' });
    await createTodo(page, { title: 'Beta' });

    const searchInput = page.getByRole('searchbox', { name: 'Search todos' });
    await searchInput.fill('Alpha');
    await expect(page.locator('.todo-item')).toHaveCount(1);

    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(searchInput).toHaveValue('');
    await expect(page.locator('.todo-item')).toHaveCount(2);
  });

  test('empty state shows contextual message for search', async ({ page }) => {
    await gotoTodoPage(page);

    await createTodo(page, { title: 'Existing task' });

    const searchInput = page.getByRole('searchbox', { name: 'Search todos' });
    await searchInput.fill('nonexistent');

    await expect(page.getByText('No results for "nonexistent"')).toBeVisible();
    await expect(page.getByText('Clear the search or try a different title')).toBeVisible();
  });

  test('workspace state persists across reloads', async ({ page }) => {
    await gotoTodoPage(page);

    await createTodo(page, { title: 'Task 1' });
    await createTodo(page, { title: 'Task 2' });

    const searchInput = page.getByRole('searchbox', { name: 'Search todos' });
    await searchInput.fill('Task 1');

    const workspaceState = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, WORKSPACE_STORAGE_KEY);

    expect(workspaceState).not.toBeNull();
    expect(workspaceState.searchQuery).toBe('Task 1');

    await page.reload();
    await expect(page.getByRole('searchbox', { name: 'Search todos' })).toHaveValue('Task 1');
    await expect(page.locator('.todo-item')).toHaveCount(1);
  });

  test('view counts update when todos are created', async ({ page }) => {
    await gotoTodoPage(page);

    const inboxBtn = page.getByRole('button', { name: /^Inbox/ });
    await expect(inboxBtn).toContainText('0');

    await createTodo(page, { title: 'New inbox task' });
    await expect(inboxBtn).toContainText('1');

    await createTodo(page, { title: 'Another task' });
    await expect(inboxBtn).toContainText('2');
  });

  test('active view has correct aria-pressed state', async ({ page }) => {
    await gotoTodoPage(page);

    const inboxBtn = page.getByRole('button', { name: /^Inbox/ });
    await expect(inboxBtn).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Upcoming' }).click();
    await expect(inboxBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'Upcoming' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

test.describe('header and auth controls', () => {
  test('anonymous mode banner is visible', async ({ page }) => {
    await gotoTodoPage(page);

    await expect(page.getByRole('alert')).toContainText('anonymous mode');
    await expect(page.getByRole('button', { name: 'Sign In to Sync' })).toBeVisible();
  });

  test('sign in button navigates to login', async ({ page }) => {
    await gotoTodoPage(page);

    await page.getByRole('button', { name: 'Sign In to Sync' }).click();
    await expect(page.getByText('Not Now')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send login code' })).toBeVisible();
  });

  test('header shows today date', async ({ page }) => {
    await gotoTodoPage(page);

    const todayLabel = new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(new Date());

    await expect(page.getByLabel(`Today is ${todayLabel}`)).toContainText(todayLabel);
  });

  test('dark mode toggle is in header', async ({ page }) => {
    await gotoTodoPage(page);

    const header = page.locator('.todo-header');
    await expect(header.locator('.dark-mode-toggle')).toBeVisible();
  });
});

test.describe('empty states', () => {
  test('shows inbox empty state', async ({ page }) => {
    await gotoTodoPage(page);

    await expect(page.getByText('Inbox is empty')).toBeVisible();
    await expect(page.getByText('Capture something with n')).toBeVisible();
  });

  test('shows today empty state', async ({ page }) => {
    await gotoTodoPage(page);

    await page.getByRole('button', { name: 'Today' }).click();
    await expect(page.getByText("Nothing on today's list")).toBeVisible();
    await expect(page.getByText('Tasks scheduled for today')).toBeVisible();
  });

  test('shows upcoming empty state', async ({ page }) => {
    await gotoTodoPage(page);

    await page.getByRole('button', { name: 'Upcoming' }).click();
    await expect(page.getByText('No upcoming tasks')).toBeVisible();
    await expect(page.getByText('Schedule work into the future')).toBeVisible();
  });

  test('shows completed empty state', async ({ page }) => {
    await gotoTodoPage(page);

    await page.getByRole('button', { name: 'Completed' }).click();
    await expect(page.getByText('No completed tasks yet')).toBeVisible();
    await expect(page.getByText('Finished work will collect here')).toBeVisible();
  });
});

test.describe('todo input advanced features', () => {
  test('expand on focus shows metadata preview', async ({ page }) => {
    await gotoTodoPage(page);

    const titleInput = page.getByLabel('New todo title');
    await titleInput.click();
    await titleInput.fill('Meeting tomorrow p1 #work');

    // Should show parsed metadata tokens (date, priority, label)
    await expect(page.locator('.todo-input-token').first()).toBeVisible();
    await expect(page.getByText('Priority high')).toBeVisible();
    await expect(page.getByText('#work')).toBeVisible();
  });

  test('more details toggles advanced fields', async ({ page }) => {
    await gotoTodoPage(page);

    // Focus the input to expand the form
    await page.getByLabel('New todo title').click();

    // Click More details to show advanced fields
    await page.getByRole('button', { name: 'More details' }).click();
    await expect(page.getByLabel('Todo description')).toBeVisible();
    await expect(page.getByLabel('Deadline', { exact: true })).toBeVisible();

    // Hide details
    await page.getByRole('button', { name: 'Hide details' }).click();
    await expect(page.getByLabel('Todo description')).not.toBeVisible();
  });

  test('cancel button resets form', async ({ page }) => {
    await gotoTodoPage(page);

    const titleInput = page.getByLabel('New todo title');
    // Focus expands the form
    await titleInput.click();
    await titleInput.fill('Test task');

    // Need to show advanced fields to see the Cancel button
    await page.getByRole('button', { name: 'More details' }).click();
    await page.getByLabel('Todo description').fill('Some description');

    await page.getByRole('button', { name: 'Cancel' }).click();

    // Form should be reset - title input is always visible
    await expect(titleInput).toHaveValue('');
  });

  test('submit with empty title is prevented', async ({ page }) => {
    await gotoTodoPage(page);

    // The Add todo button is always enabled; clicking with empty title focuses the input
    const addBtn = page.getByLabel('Add todo');
    await expect(addBtn).toBeEnabled();

    // Clicking with empty title focuses the input without creating a todo
    await addBtn.click();
    await expect(page.getByLabel('New todo title')).toBeFocused();
    await expect(page.locator('.todo-item')).toHaveCount(0);

    // Type something and submit — should create the todo
    await page.getByLabel('New todo title').fill('Task');
    await addBtn.click();
    await expect(page.locator('.todo-item')).toHaveCount(1);
  });
});
