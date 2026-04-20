import { describe, expect, it } from 'vitest';

import type { Todo } from '../types';
import { sortTodos } from './todoSorting';

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

describe('todo sorting', () => {
  it('sorts by view, then sort order, then recency', () => {
    const sorted = sortTodos([
      makeTodo({
        id: 'completed',
        title: 'Completed',
        status: 'completed',
        completed: true,
        completed_at: '2026-04-05T12:00:00.000Z',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-05T12:00:00.000Z',
      }),
      makeTodo({
        id: 'anytime',
        title: 'Anytime',
        status: 'anytime',
        created_at: '2026-04-04T00:00:00.000Z',
        updated_at: '2026-04-04T00:00:00.000Z',
      }),
      makeTodo({
        id: 'upcoming',
        title: 'Upcoming',
        deadline: '2026-04-04',
        created_at: '2026-04-03T00:00:00.000Z',
        updated_at: '2026-04-03T00:00:00.000Z',
      }),
      makeTodo({
        id: 'today',
        title: 'Today',
        deadline: '2026-04-03',
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      }),
      makeTodo({
        id: 'inbox-low',
        title: 'Inbox low',
        sort_order: 0,
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      }),
      makeTodo({
        id: 'inbox-high',
        title: 'Inbox high',
        sort_order: 1,
        created_at: '2026-04-05T00:00:00.000Z',
        updated_at: '2026-04-05T00:00:00.000Z',
      }),
      makeTodo({
        id: 'inbox-newer',
        title: 'Inbox newer',
        sort_order: 0,
        created_at: '2026-04-06T00:00:00.000Z',
        updated_at: '2026-04-06T00:00:00.000Z',
      }),
      makeTodo({
        id: 'someday',
        title: 'Someday',
        status: 'someday',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      }),
    ]);

    expect(sorted.map((todo) => todo.id)).toEqual([
      'today',
      'upcoming',
      'inbox-newer',
      'inbox-low',
      'inbox-high',
      'anytime',
      'someday',
      'completed',
    ]);
  });
});
