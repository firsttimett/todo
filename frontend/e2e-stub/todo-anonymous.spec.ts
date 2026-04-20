import { expect, test, type Locator, type Page } from '@playwright/test';
import { stubAnonymousMode, formatLocalDate, formatLocalDateTime } from './fixtures';

/** Ensures a <details> section is open (needed for WebKit, which doesn't auto-expand like Chromium). */
async function openDetailSection(pane: Locator, sectionName: string): Promise<void> {
  const summary = pane.locator('summary.detail-section__toggle').filter({ hasText: sectionName });
  const isOpen = await summary.evaluate(
    (el) => (el.parentElement as HTMLDetailsElement)?.open ?? false,
  );
  if (!isOpen) {
    await summary.click();
  }
}

const LOCAL_STORAGE_KEY = 'tfcd_todos';

type AnonymousTodoInput = {
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  deadline?: string;
  labels?: string;
};

async function gotoTodoPage(page: Page): Promise<void> {
  await stubAnonymousMode(page);
  await page.goto('/');

  await expect(page.getByLabel('New todo title')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('anonymous mode');
  await expect(page.getByRole('button', { name: /^Inbox/ })).toBeVisible();
  // Detail pane is not rendered until a todo is selected
  await expect(page.locator('.todo-detail-pane')).not.toBeVisible();
}

async function createTodo(
  page: Page,
  todo: AnonymousTodoInput,
): Promise<void> {
  const form = page.locator('.todo-input-form');
  const titleInput = form.getByLabel('New todo title');

  await titleInput.click();
  await titleInput.fill(todo.title);

  if (todo.description || todo.deadline) {
    await form.getByRole('button', { name: 'More details' }).click();
  }

  if (todo.description) {
    await form.getByLabel('Todo description').fill(todo.description);
  }

  if (todo.priority) {
    await form.getByLabel('Priority', { exact: true }).selectOption(todo.priority);
  }

  if (todo.deadline) {
    await form.getByLabel('Deadline', { exact: true }).fill(todo.deadline);
  }

  if (todo.labels) {
    await form.getByLabel('Labels', { exact: true }).fill(todo.labels);
  }

  await form.getByLabel('Add todo').click();
}

async function readLocalTodos(page: Page) {
  return page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : [];
  }, LOCAL_STORAGE_KEY);
}

test.describe('anonymous todo flow', () => {
  test('creates and persists an inbox todo locally', async ({ page }) => {
    await gotoTodoPage(page);

    await page.keyboard.press('n');
    await expect(page.getByLabel('New todo title')).toBeFocused();

    await createTodo(page, {
      title: 'Plan quarterly review',
      description: 'Draft agenda and circulate notes',
      priority: 'high',
      labels: 'Work',
    });

    await expect(page.locator('.todo-item')).toHaveCount(1);
    await expect(page.getByText('1 todo in Inbox', { exact: false })).toBeVisible();
    await expect(page.getByLabel('Priority High')).toBeVisible();
    await expect(page.locator('.label-chip')).toHaveText('Work');

    const storedTodos = await readLocalTodos(page);
    await expect(storedTodos).toHaveLength(1);
    await expect(storedTodos[0]).toMatchObject({
      title: 'Plan quarterly review',
      description: 'Draft agenda and circulate notes',
      priority: 'high',
      labels: ['Work'],
      status: 'inbox',
      completed: false,
      deadline: null,
    });
  });

  test('parses quick add metadata from a single entry line', async ({ page }) => {
    await gotoTodoPage(page);

    await page
      .getByLabel('New todo title')
      .fill('Prep roadmap tomorrow p1 #Work #Planning');
    await page.getByLabel('Add todo').click();

    const createdTodo = page.locator('.todo-item', { hasText: 'Prep roadmap' });
    await expect(page.getByText('1 todo in Upcoming', { exact: false })).toBeVisible();
    await expect(createdTodo).toBeVisible();
    await expect(createdTodo.locator('.label-chip')).toHaveText([
      'Work',
      'Planning',
    ]);

    const storedTodos = await readLocalTodos(page);
    await expect(storedTodos[0]).toMatchObject({
      title: 'Prep roadmap',
      priority: 'high',
      start_date: formatLocalDate(1),
      labels: ['Work', 'Planning'],
    });
  });

  test('navigates views and toggles completion from the keyboard', async ({
    page,
  }) => {
    await gotoTodoPage(page);

    await createTodo(page, {
      title: 'Write weekly report',
      priority: 'medium',
      labels: 'Work',
    });
    await createTodo(page, {
      title: 'Buy groceries',
      priority: 'high',
      labels: 'Personal',
    });
    await createTodo(page, {
      title: 'Prepare launch checklist',
      priority: 'medium',
      deadline: formatLocalDate(1),
      labels: 'Ops',
    });

    await page.getByRole('button', { name: /^Inbox/ }).click();
    await expect(page.locator('.todo-item')).toHaveCount(2);
    await expect(page.getByText('Buy groceries', { exact: true })).toBeVisible();
    await expect(page.getByText('Write weekly report', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Prepare launch checklist', { exact: true }),
    ).not.toBeVisible();

    const firstInboxItem = page.locator('.todo-item', {
      hasText: 'Buy groceries',
    });
    await firstInboxItem.click();
    await expect(page.getByRole('complementary', { name: 'Task details' })).toContainText('Buy groceries');

    await firstInboxItem.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('complementary', { name: 'Task details' })).toContainText('Write weekly report');

    await page.keyboard.press('d');
    await page.getByRole('button', { name: /^Completed/ }).click();
    await expect(page.locator('.todo-item')).toHaveCount(1);
    await expect(page.getByText('Write weekly report', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /^Upcoming/ }).click();
    await expect(page.getByText('Prepare launch checklist', { exact: true })).toBeVisible();

    const storedTodos = await readLocalTodos(page);
    await expect(
      storedTodos.find(
        (todo: { title: string }) => todo.title === 'Write weekly report',
      ),
    ).toMatchObject({
      completed: true,
      status: 'completed',
    });
  });

  test('edits and deletes a todo from the persistent detail pane', async ({
    page,
  }) => {
    await gotoTodoPage(page);

    await createTodo(page, {
      title: 'File taxes',
      description: 'Collect receipts first',
      priority: 'low',
      labels: 'Admin',
    });

    const detailPane = page.getByRole('complementary', { name: 'Task details' });
    await expect(detailPane).toContainText('File taxes');

    await detailPane.getByLabel('Title', { exact: true }).fill('File taxes 2026');
    await detailPane
      .getByLabel('Description', { exact: true })
      .fill('Collect receipts and confirm totals');
    await detailPane.getByLabel('Priority', { exact: true }).selectOption('high');
    await openDetailSection(detailPane, 'Organization');
    await detailPane.getByLabel('Labels', { exact: true }).fill('Finance');
    await detailPane.getByRole('button', { name: 'Save' }).click();

    // Pane stays open after save; verify changes are reflected
    await expect(page.getByText('File taxes 2026', { exact: true })).toBeVisible();
    await expect(page.locator('.label-chip')).toHaveText('Finance');
    await expect(page.getByLabel('Priority High')).toBeVisible();

    // Delete directly from the still-open pane
    await detailPane.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('Inbox is empty', { exact: true })).toBeVisible();
    // Note: storage deletion is deferred 7s for undo toast; UI emptiness is the correct signal.
  });

  test('edits subtasks, recurrence, and reminders in the detail pane', async ({
    page,
  }) => {
    await gotoTodoPage(page);

    await createTodo(page, {
      title: 'Coordinate launch prep',
      priority: 'medium',
      labels: 'Launch',
    });

    await expect(page.locator('.todo-item')).toHaveCount(1);

    const detailPane = page.getByRole('complementary', { name: 'Task details' });
    await expect(detailPane).toContainText('Coordinate launch prep');

    await openDetailSection(detailPane, 'Subtasks');
    const subtaskInput = detailPane.getByLabel('Subtask title', { exact: true });
    await subtaskInput.fill('Draft agenda');
    await detailPane.getByRole('button', { name: 'Add subtask' }).click();
    await subtaskInput.fill('Send invites');
    await detailPane.getByRole('button', { name: 'Add subtask' }).click();

    await detailPane
      .getByLabel('Mark subtask Draft agenda complete')
      .click();

    await openDetailSection(detailPane, 'Scheduling');
    await detailPane.getByLabel('Frequency', { exact: true }).selectOption('weekly');
    await detailPane.getByRole('button', { name: 'Repeat on Monday' }).click();
    await detailPane.getByRole('button', { name: 'Repeat on Wednesday' }).click();

    const reminderLocalValue = formatLocalDateTime(1, 14, 45);
    await detailPane.getByLabel('Reminder date and time', { exact: true }).fill(reminderLocalValue);
    await detailPane.getByRole('button', { name: 'Add reminder' }).click();

    const expectedReminderIso = await page.evaluate((value) => {
      return new Date(value).toISOString();
    }, reminderLocalValue);

    await detailPane.getByRole('button', { name: 'Save' }).click();

    // Pane stays open after save; verify subtask progress in list
    await expect(page.locator('.todo-item').filter({ hasText: 'Coordinate launch prep' })).toContainText(
      '1/2 done',
    );

    const storedTodos = await readLocalTodos(page);
    const storedTodo = storedTodos.find(
      (todo: { title: string }) => todo.title === 'Coordinate launch prep',
    );

    await expect(storedTodo).toBeDefined();
    await expect(storedTodo).toMatchObject({
      title: 'Coordinate launch prep',
      subtasks: [
        {
          title: 'Draft agenda',
          completed: true,
          sort_order: 0,
        },
        {
          title: 'Send invites',
          completed: false,
          sort_order: 1,
        },
      ],
      recurrence: {
        frequency: 'weekly',
        interval: 1,
        weekdays: [1, 3],
        day_of_month: null,
      },
      reminders: [
        {
          remind_at: expectedReminderIso,
          acknowledged_at: null,
        },
      ],
    });
  });

  test('filters by search and saved views, then restores them after reload', async ({
    page,
  }) => {
    await gotoTodoPage(page);

    await createTodo(page, {
      title: 'Pay invoices',
      description: 'Accounts receivable follow-up',
      priority: 'high',
      deadline: formatLocalDate(-1),
      labels: 'Finance',
    });
    await createTodo(page, {
      title: 'Book dentist',
      description: 'Dental checkup',
      priority: 'medium',
      deadline: formatLocalDate(-1),
      labels: 'Personal',
    });
    await createTodo(page, {
      title: 'Plan team lunch',
      description: 'Weekly food run',
      priority: 'low',
      labels: 'Team',
    });

    await page.getByRole('button', { name: /^Overdue/ }).click();
    await expect(page.locator('.todo-item')).toHaveCount(2);
    await expect(page.getByText('Pay invoices', { exact: true })).toBeVisible();
    await expect(page.getByText('Book dentist', { exact: true })).toBeVisible();
    await expect(page.getByText('Plan team lunch', { exact: true })).not.toBeVisible();

    await page.getByRole('searchbox', { name: 'Search todos' }).fill('receivable');
    await expect(page.locator('.todo-item')).toHaveCount(1);
    await expect(page.getByText('Pay invoices', { exact: true })).toBeVisible();
    await expect(page.getByText('Book dentist', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Search "receivable"', { exact: false })).toBeVisible();

    await page.reload();

    await expect(page.getByRole('searchbox', { name: 'Search todos' })).toHaveValue('receivable');
    await expect(page.getByRole('button', { name: /^Overdue/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.todo-item')).toHaveCount(1);
    await expect(page.getByText('Pay invoices', { exact: true })).toBeVisible();
    await expect(page.getByText('Book dentist', { exact: true })).not.toBeVisible();
  });
});
