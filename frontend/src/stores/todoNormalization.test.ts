import { describe, expect, it } from 'vitest';

import { buildTodoRecord, normalizeTodoRecord, todoSignature } from './todoNormalization';

describe('todo normalization', () => {
  it('normalizes canonical v2 todo data', () => {
    const normalized = normalizeTodoRecord({
      id: 'todo-1',
      title: 'Plan quarterly review',
      description: 'Draft agenda',
      completed: false,
      priority: 'high',
      deadline: '2026-04-15T09:00:00.000Z',
      labels: ['Work'],
      created_at: '2026-04-01T10:00:00.000Z',
      updated_at: '2026-04-02T10:00:00.000Z',
    });

    expect(normalized).toMatchObject({
      id: 'todo-1',
      title: 'Plan quarterly review',
      description: 'Draft agenda',
      completed: false,
      priority: 'high',
      start_date: null,
      deadline: '2026-04-15',
      labels: ['Work'],
      status: 'inbox',
      sort_order: 0,
      completed_at: null,
    });
  });

  it('builds a create payload with the same canonical fields', () => {
    const record = buildTodoRecord(
      {
        title: 'Ship phase 1',
        description: 'Coordinate the first slice',
        priority: 'medium',
        deadline: '2026-04-18',
        labels: ['Work'],
      },
      {
        id: 'todo-2',
        createdAt: '2026-04-03T09:00:00.000Z',
        updatedAt: '2026-04-03T09:00:00.000Z',
      },
    );

    expect(record).toMatchObject({
      id: 'todo-2',
      title: 'Ship phase 1',
      description: 'Coordinate the first slice',
      priority: 'medium',
      start_date: null,
      deadline: '2026-04-18',
      labels: ['Work'],
      status: 'inbox',
      sort_order: 0,
      completed: false,
      completed_at: null,
      created_at: '2026-04-03T09:00:00.000Z',
      updated_at: '2026-04-03T09:00:00.000Z',
    });
  });

  it('ignores ids and timestamps when generating dedupe signatures', () => {
    const firstSignature = todoSignature({
      id: 'todo-1',
      title: 'Collect receipts',
      description: '',
      completed: false,
      priority: 'low',
      deadline: '2026-04-20',
      labels: ['Finance'],
      status: 'inbox',
      sort_order: 0,
      completed_at: null,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    });

    const secondSignature = todoSignature({
      id: 'todo-2',
      title: 'Collect receipts',
      description: '',
      completed: false,
      priority: 'low',
      start_date: null,
      deadline: '2026-04-20',
      labels: ['Finance'],
      status: 'inbox',
      sort_order: 0,
      completed_at: null,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    });

    expect(firstSignature).toBe(secondSignature);
  });
});
