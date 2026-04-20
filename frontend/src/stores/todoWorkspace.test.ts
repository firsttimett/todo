import { describe, expect, it } from 'vitest';

import type { Todo } from '../types';
import type { TodoWorkspaceState } from './todoWorkspace';
import { getWorkspaceResult } from './todoWorkspace';

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

describe('getWorkspaceResult', () => {
  const baseState: TodoWorkspaceState = {
    selectedView: 'inbox',
    savedView: null,
    searchQuery: '',
    organizeBy: 'date',
  };

  it('filters todos by search query', () => {
    const todos = [
      makeTodo({ id: 'a', title: 'Write release notes' }),
      makeTodo({ id: 'b', title: 'Sketch flow' }),
    ];

    const result = getWorkspaceResult(todos, { ...baseState, searchQuery: 'release' });

    expect(result.todos.map((todo) => todo.id)).toEqual(['a']);
  });

  it('returns all inbox todos when no filters applied', () => {
    const todos = [
      makeTodo({ id: 'a', title: 'Task A' }),
      makeTodo({ id: 'b', title: 'Task B' }),
    ];

    const result = getWorkspaceResult(todos, baseState);

    expect(result.todos).toHaveLength(2);
  });
});
