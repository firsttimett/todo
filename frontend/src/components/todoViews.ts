import { sortTodos } from '../stores/todoSorting';
import {
  deriveTodoView,
  TODO_VIEWS as STORE_TODO_VIEWS,
  type TodoView as TodoViewKey,
} from '../stores/todoViews';
import type { SavedTodoViewKey } from '../stores/todoWorkspace';
import type { Todo } from '../types';

export type PlanningTodo = Todo;
export type { TodoViewKey };

export const TODO_VIEWS: Array<{
  key: TodoViewKey;
  label: string;
  description: string;
}> = STORE_TODO_VIEWS.map((key) => ({
  key,
  label: {
    inbox: 'Inbox',
    today: 'Today',
    upcoming: 'Upcoming',
    anytime: 'Anytime',
    someday: 'Someday',
    completed: 'Completed',
  }[key],
  description: {
    inbox: 'Unscheduled work that needs triage.',
    today: 'Tasks that should be handled now.',
    upcoming: 'Work that is scheduled for later.',
    anytime: 'Open-ended tasks that can happen whenever.',
    someday: 'Ideas that are intentionally deferred.',
    completed: 'Finished tasks, kept for reference.',
  }[key],
}));

export const SAVED_TODO_VIEWS: Array<{
  key: SavedTodoViewKey;
  label: string;
  description: string;
}> = [
  {
    key: 'overdue',
    label: 'Overdue',
    description: 'Tasks with a past deadline or start date.',
  },
  {
    key: 'highPriority',
    label: 'High priority',
    description: 'Tasks marked as high priority.',
  },
  {
    key: 'noDate',
    label: 'No date',
    description: 'Tasks without a start date or deadline.',
  },
  {
    key: 'workThisWeek',
    label: 'Work this week',
    description: 'Tasks scheduled for the current week.',
  },
];

export function getTodoLabels(todo: PlanningTodo): string[] {
  return todo.labels.map((label) => label.trim()).filter(Boolean);
}

export function getTodoDeadline(todo: PlanningTodo): string | null {
  return todo.deadline;
}

export function getTodoStartDate(todo: PlanningTodo): string | null {
  return todo.start_date;
}

export function getTodoView(todo: PlanningTodo): TodoViewKey {
  return deriveTodoView(todo);
}

export function getViewTodos(
  todos: PlanningTodo[],
  view: TodoViewKey,
): PlanningTodo[] {
  return sortTodos(todos.filter((todo) => getTodoView(todo) === view));
}

export function getTodoViewCounts(
  todos: PlanningTodo[],
): Record<TodoViewKey, number> {
  const counts: Record<TodoViewKey, number> = {
    inbox: 0,
    today: 0,
    upcoming: 0,
    anytime: 0,
    someday: 0,
    completed: 0,
  };

  for (const todo of todos) {
    counts[getTodoView(todo)] += 1;
  }

  return counts;
}
