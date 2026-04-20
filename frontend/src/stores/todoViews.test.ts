import { describe, expect, it } from 'vitest';

import type { Todo } from '../types';
import { deriveTodoView, TODO_VIEWS, todoMatchesView } from './todoViews';

function makeTodo(overrides: Partial<Todo>): Todo {
  return {
    id: 'todo',
    title: 'Task',
    description: '',
    completed: false,
    priority: 'medium',
    start_date: null,
    deadline: null,
    labels: [],
    status: 'inbox',
    sort_order: 0,
    completed_at: null,
    subtasks: [],
    reminders: [],
    recurrence: null,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('todo views', () => {
  const today = new Date(2026, 3, 3);

  it('defines the expected view set', () => {
    expect(TODO_VIEWS).toEqual([
      'inbox',
      'today',
      'upcoming',
      'anytime',
      'someday',
      'completed',
    ]);
  });

  it('derives Inbox, Today, Upcoming, Anytime, Someday, and Completed', () => {
    expect(deriveTodoView(makeTodo({ status: 'inbox' }), today)).toBe('inbox');
    expect(
      deriveTodoView(makeTodo({ deadline: '2026-04-03' }), today),
    ).toBe('today');
    expect(
      deriveTodoView(makeTodo({ start_date: '2026-04-04' }), today),
    ).toBe('upcoming');
    expect(deriveTodoView(makeTodo({ status: 'anytime' }), today)).toBe('anytime');
    expect(deriveTodoView(makeTodo({ status: 'someday' }), today)).toBe('someday');
    expect(
      deriveTodoView(
        makeTodo({ completed: true, completed_at: '2026-04-03T10:00:00.000Z' }),
        today,
      ),
    ).toBe('completed');
  });

  it('matches the derived view helper against a reference date', () => {
    expect(todoMatchesView(makeTodo({ deadline: '2026-04-03' }), 'today', today)).toBe(
      true,
    );
    expect(todoMatchesView(makeTodo({ deadline: '2026-04-03' }), 'inbox', today)).toBe(
      false,
    );
  });
});
