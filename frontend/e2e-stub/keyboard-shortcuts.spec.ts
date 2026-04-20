import { expect, test, type Page } from '@playwright/test';
import { stubAnonymousMode } from './fixtures';

async function gotoTodoPage(page: Page): Promise<void> {
  await stubAnonymousMode(page);
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

async function selectTodoByAction(page: Page, title: string): Promise<void> {
  const todoItem = page.locator('.todo-item', { hasText: title });
  // Hover to reveal action buttons
  await todoItem.hover();
  await todoItem.getByLabel('Open details').click();
  await expect(page.locator('#todo-detail-title')).toBeVisible();
}

test.describe('keyboard shortcuts', () => {
  test('n focuses the new todo input', async ({ page }) => {
    await gotoTodoPage(page);

    await page.locator('.todo-header-brand').click();
    await expect(page.getByLabel('New todo title')).not.toBeFocused();

    await page.keyboard.press('n');
    await expect(page.getByLabel('New todo title')).toBeFocused();
  });

  test('n is ignored when typing in an input', async ({ page }) => {
    await gotoTodoPage(page);

    const input = page.getByLabel('New todo title');
    await input.click();
    await input.fill('test');

    await page.keyboard.press('n');
    await expect(input).toHaveValue('testn');
  });

  test('d toggles completion of selected todo', async ({ page }) => {
    await gotoTodoPage(page);

    await createTodo(page, 'Task to complete');
    const todoItem = page.locator('.todo-item', { hasText: 'Task to complete' });
    await expect(todoItem).toHaveClass(/todo-item--selected/);

    // Click on a neutral area to blur any focused input without deselecting
    await page.locator('.todo-header-brand').click();

    await page.keyboard.press('d');
    // Wait for the todo to leave the current view before navigating
    await expect(page.locator('.todo-item', { hasText: 'Task to complete' })).not.toBeVisible();
    await page.getByRole('button', { name: /^Completed/ }).click();
    await expect(page.locator('.todo-item', { hasText: 'Task to complete' })).toBeVisible();

    // Toggle back to incomplete
    await page.locator('.todo-item', { hasText: 'Task to complete' }).click();
    await page.locator('.todo-header-brand').click();
    await page.keyboard.press('d');
    // Wait for the todo to leave the Completed view before navigating
    await expect(page.locator('.todo-item', { hasText: 'Task to complete' })).not.toBeVisible();
    // Should move back to Inbox
    await page.getByRole('button', { name: /^Inbox/ }).click();
    await expect(page.locator('.todo-item', { hasText: 'Task to complete' })).toBeVisible();
    await expect(page.locator('.todo-item', { hasText: 'Task to complete' })).not.toHaveClass(/todo-item--completed/);
  });

  test('Escape deselects current todo and closes detail pane', async ({ page }) => {
    await gotoTodoPage(page);

    await createTodo(page, 'Escape test');
    const todoItem = page.locator('.todo-item', { hasText: 'Escape test' });
    await expect(todoItem).toHaveClass(/todo-item--selected/);
    await expect(page.locator('.todo-detail-pane--open')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.locator('.todo-detail-pane--open')).not.toBeVisible();
    await expect(todoItem).not.toHaveClass(/todo-item--selected/);
  });

  test('e focuses the detail pane title', async ({ page }) => {
    await gotoTodoPage(page);

    await createTodo(page, 'Edit me');
    // createTodo already selects the todo and opens the detail pane

    await page.keyboard.press('e');

    const titleInput = page.locator('#todo-detail-title');
    await expect(titleInput).toBeFocused();
  });

  test('shortcuts are ignored when textarea is focused', async ({ page }) => {
    await gotoTodoPage(page);

    await createTodo(page, 'Some task');
    const todoItem = page.locator('.todo-item', { hasText: 'Some task' });
    // Select the todo (already selected by createTodo, but let's be explicit)
    await expect(todoItem).toHaveClass(/todo-item--selected/);

    const descTextarea = page.locator('#todo-detail-description');
    await descTextarea.click();
    await expect(descTextarea).toBeFocused();

    await page.keyboard.press('d');
    await expect(descTextarea).toHaveValue('d');
    await expect(todoItem).not.toHaveClass(/todo-item--completed/);
  });
});
