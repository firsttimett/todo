import type { Todo, TodoStatus } from '../types';

export type TodoView = TodoStatus;

export const TODO_VIEWS: TodoView[] = [
  'inbox',
  'today',
  'upcoming',
  'anytime',
  'someday',
  'completed',
];

const VIEW_SET = new Set<TodoView>(TODO_VIEWS);

export function getLocalDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

export function isTodoView(value: string): value is TodoView {
  return VIEW_SET.has(value as TodoView);
}

export function deriveTodoView(
  todo: Pick<
    Todo,
    'status' | 'completed' | 'completed_at' | 'start_date' | 'deadline'
  >,
  referenceDate: Date = new Date(),
): TodoView {
  if (todo.completed || todo.completed_at || todo.status === 'completed') {
    return 'completed';
  }

  if (todo.status === 'someday') return 'someday';
  if (todo.status === 'today') return 'today';
  if (todo.status === 'upcoming') return 'upcoming';

  const todayKey = getLocalDateKey(referenceDate);
  const startKey = normalizeDateKey(todo.start_date);
  const deadlineKey = normalizeDateKey(todo.deadline);

  if (startKey === todayKey || deadlineKey === todayKey) {
    return 'today';
  }

  if (
    (startKey !== null && startKey > todayKey) ||
    (deadlineKey !== null && deadlineKey > todayKey)
  ) {
    return 'upcoming';
  }

  if (todo.status === 'anytime') return 'anytime';
  return 'inbox';
}

export function todoMatchesView(
  todo: Pick<
    Todo,
    'status' | 'completed' | 'completed_at' | 'start_date' | 'deadline'
  >,
  view: TodoView,
  referenceDate: Date = new Date(),
): boolean {
  return deriveTodoView(todo, referenceDate) === view;
}
