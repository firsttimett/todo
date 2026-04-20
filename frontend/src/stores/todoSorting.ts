import type { Todo } from '../types';
import { deriveTodoView,type TodoView } from './todoViews';

const VIEW_ORDER: Record<TodoView, number> = {
  inbox: 0,
  today: 1,
  upcoming: 2,
  anytime: 3,
  someday: 4,
  completed: 5,
};

function compareTextDescending(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right.localeCompare(left);
}

function compareTextAscending(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left.localeCompare(right);
}

function compareCreatedAt(left: Todo, right: Todo): number {
  return compareTextDescending(left.created_at, right.created_at);
}

export function compareTodos(left: Todo, right: Todo): number {
  const leftView = deriveTodoView(left);
  const rightView = deriveTodoView(right);
  const viewDiff = VIEW_ORDER[leftView] - VIEW_ORDER[rightView];
  if (viewDiff !== 0) return viewDiff;

  const sortOrderDiff = left.sort_order - right.sort_order;
  if (sortOrderDiff !== 0) return sortOrderDiff;

  if (leftView === 'completed') {
    const completedDiff = compareTextDescending(left.completed_at, right.completed_at);
    if (completedDiff !== 0) return completedDiff;
  }

  const dateKeyLeft = left.deadline ?? left.start_date;
  const dateKeyRight = right.deadline ?? right.start_date;
  const dateDiff = compareTextAscending(dateKeyLeft, dateKeyRight);
  if (dateDiff !== 0) return dateDiff;

  const createdDiff = compareCreatedAt(left, right);
  if (createdDiff !== 0) return createdDiff;

  const titleDiff = left.title.localeCompare(right.title);
  if (titleDiff !== 0) return titleDiff;

  return left.id.localeCompare(right.id);
}

export function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort(compareTodos);
}
