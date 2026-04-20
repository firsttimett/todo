import type { Todo } from '../types';
import { sortTodos } from './todoSorting';
import { getLocalDateKey, todoMatchesView,type TodoView } from './todoViews';

export type SavedTodoViewKey =
  | 'overdue'
  | 'highPriority'
  | 'noDate'
  | 'workThisWeek';

export type TodoWorkspaceOrganizeKey =
  | 'date'
  | 'priority'
  | 'label';

export interface TodoWorkspaceState {
  selectedView: TodoView;
  savedView: SavedTodoViewKey | null;
  searchQuery: string;
  organizeBy: TodoWorkspaceOrganizeKey;
}

export interface TodoWorkspaceSection {
  key: string;
  label: string;
  todos: Todo[];
}

export interface TodoWorkspaceResult {
  todos: Todo[];
  sections: TodoWorkspaceSection[];
}

export const TODO_WORKSPACE_STORAGE_KEY = 'tfcd_todo_workspace';

export const TODO_WORKSPACE_ORGANIZE_OPTIONS: Array<{
  key: TodoWorkspaceOrganizeKey;
  label: string;
}> = [
  { key: 'date', label: 'Date' },
  { key: 'priority', label: 'Priority' },
  { key: 'label', label: 'Label' },
];

const DEFAULT_WORKSPACE_STATE: TodoWorkspaceState = {
  selectedView: 'inbox',
  savedView: null,
  searchQuery: '',
  organizeBy: 'date',
};

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readSelectedView(value: unknown): TodoView {
  const candidate = readString(value);
  return candidate === 'today' ||
    candidate === 'upcoming' ||
    candidate === 'anytime' ||
    candidate === 'someday' ||
    candidate === 'completed'
    ? candidate
    : 'inbox';
}

function readSavedView(value: unknown): SavedTodoViewKey | null {
  const candidate = readString(value);
  return candidate === 'overdue' ||
    candidate === 'highPriority' ||
    candidate === 'noDate' ||
    candidate === 'workThisWeek'
    ? candidate
    : null;
}

function readOrganizeBy(value: unknown): TodoWorkspaceOrganizeKey {
  const candidate = readString(value);
  return candidate === 'priority' || candidate === 'label' ? candidate : 'date';
}

function parseDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function getWeekBounds(referenceDate: Date): { start: string; end: string } {
  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);

  const end = addDays(start, 6);
  return {
    start: getLocalDateKey(start),
    end: getLocalDateKey(end),
  };
}

function getEffectiveDateKey(todo: Pick<Todo, 'start_date' | 'deadline'>): string | null {
  const startDate = parseDateKey(todo.start_date);
  const deadline = parseDateKey(todo.deadline);

  if (startDate === null) return deadline;
  if (deadline === null) return startDate;
  return startDate.localeCompare(deadline) <= 0 ? startDate : deadline;
}

function getDateBucket(
  todo: Pick<Todo, 'completed' | 'completed_at' | 'status' | 'start_date' | 'deadline'>,
  referenceDate: Date,
): { key: string; label: string; order: number } {
  if (todo.completed || todo.completed_at || todo.status === 'completed') {
    return { key: 'completed', label: 'Completed', order: 6 };
  }

  const todayKey = getLocalDateKey(referenceDate);
  const tomorrowKey = getLocalDateKey(addDays(referenceDate, 1));
  const weekBounds = getWeekBounds(referenceDate);
  const dateKey = getEffectiveDateKey(todo);

  if (!dateKey) {
    return { key: 'no-date', label: 'No date', order: 5 };
  }

  if (dateKey < todayKey) {
    return { key: 'overdue', label: 'Overdue', order: 0 };
  }

  if (dateKey === todayKey) {
    return { key: 'today', label: 'Today', order: 1 };
  }

  if (dateKey === tomorrowKey) {
    return { key: 'tomorrow', label: 'Tomorrow', order: 2 };
  }

  if (dateKey <= weekBounds.end) {
    return { key: 'this-week', label: 'This week', order: 3 };
  }

  return { key: 'later', label: 'Later', order: 4 };
}

function getPriorityBucket(priority: Todo['priority']): {
  key: string;
  label: string;
  order: number;
} {
  switch (priority) {
    case 'high':
      return { key: 'priority-high', label: 'High priority', order: 0 };
    case 'medium':
      return { key: 'priority-medium', label: 'Medium priority', order: 1 };
    case 'low':
      return { key: 'priority-low', label: 'Low priority', order: 2 };
  }
}

function getLabelBucket(labels: string[]): { key: string; label: string; order: number } {
  const primaryLabel = labels[0]?.trim();
  if (!primaryLabel) {
    return { key: 'label-none', label: 'No labels', order: 0 };
  }

  return {
    key: `label-${primaryLabel.toLowerCase()}`,
    label: primaryLabel,
    order: 1,
  };
}

export function loadTodoWorkspaceState(): TodoWorkspaceState {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_WORKSPACE_STATE;
  }

  try {
    const raw = localStorage.getItem(TODO_WORKSPACE_STORAGE_KEY);
    if (!raw) return DEFAULT_WORKSPACE_STATE;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      selectedView: readSelectedView(parsed.selectedView),
      savedView: readSavedView(parsed.savedView),
      searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : '',
      organizeBy: readOrganizeBy(parsed.organizeBy),
    };
  } catch {
    return DEFAULT_WORKSPACE_STATE;
  }
}

export function saveTodoWorkspaceState(state: TodoWorkspaceState): void {
  if (typeof localStorage === 'undefined') return;

  localStorage.setItem(TODO_WORKSPACE_STORAGE_KEY, JSON.stringify(state));
}

export function normalizeWorkspaceSearchQuery(value: string): string {
  return value.trim();
}

export function matchesTodoSearch(todo: Pick<Todo, 'title' | 'description'>, query: string): boolean {
  const normalized = normalizeWorkspaceSearchQuery(query).toLowerCase();
  if (!normalized) return true;

  const haystack = `${todo.title} ${todo.description}`.toLowerCase();
  return haystack.includes(normalized);
}

export function todoMatchesSavedView(
  todo: Pick<
    Todo,
    'completed' | 'completed_at' | 'priority' | 'start_date' | 'deadline' | 'labels'
  >,
  savedView: SavedTodoViewKey,
  referenceDate: Date = new Date(),
): boolean {
  switch (savedView) {
    case 'overdue': {
      if (todo.completed || todo.completed_at) return false;
      const dateKey = getEffectiveDateKey(todo);
      if (!dateKey) return false;
      return dateKey < getLocalDateKey(referenceDate);
    }
    case 'highPriority':
      return todo.priority === 'high';
    case 'noDate':
      return parseDateKey(todo.start_date) === null && parseDateKey(todo.deadline) === null;
    case 'workThisWeek': {
      if (todo.completed || todo.completed_at) return false;
      const dateKey = getEffectiveDateKey(todo);
      if (!dateKey) return false;
      const weekBounds = getWeekBounds(referenceDate);
      return dateKey >= weekBounds.start && dateKey <= weekBounds.end;
    }
  }
}

export function getSavedViewCounts(
  todos: Todo[],
  referenceDate: Date = new Date(),
): Record<SavedTodoViewKey, number> {
  return {
    overdue: todos.filter((todo) => todoMatchesSavedView(todo, 'overdue', referenceDate)).length,
    highPriority: todos.filter((todo) => todoMatchesSavedView(todo, 'highPriority', referenceDate)).length,
    noDate: todos.filter((todo) => todoMatchesSavedView(todo, 'noDate', referenceDate)).length,
    workThisWeek: todos.filter((todo) => todoMatchesSavedView(todo, 'workThisWeek', referenceDate)).length,
  };
}

export function getWorkspaceResult(
  todos: Todo[],
  settings: Pick<
    TodoWorkspaceState,
    | 'selectedView'
    | 'savedView'
    | 'searchQuery'
    | 'organizeBy'
  >,
  referenceDate: Date = new Date(),
): TodoWorkspaceResult {
  const filtered = todos.filter((todo) => {
    if (!todoMatchesView(todo, settings.selectedView, referenceDate)) {
      return false;
    }

    if (settings.savedView && !todoMatchesSavedView(todo, settings.savedView, referenceDate)) {
      return false;
    }

    return matchesTodoSearch(todo, settings.searchQuery);
  });

  const groups = organizeWorkspaceTodos(filtered, settings.organizeBy, referenceDate);
  return {
    sections: groups,
    todos: groups.flatMap((group) => group.todos),
  };
}

export function organizeWorkspaceTodos(
  todos: Todo[],
  organizeBy: TodoWorkspaceOrganizeKey,
  referenceDate: Date = new Date(),
): TodoWorkspaceSection[] {
  const groups = new Map<
    string,
    {
      key: string;
      label: string;
      order: number;
      todos: Todo[];
    }
  >();

  function addGroup(key: string, label: string, order: number, todo: Todo): void {
    const current = groups.get(key);
    if (current) {
      current.todos.push(todo);
      return;
    }

    groups.set(key, {
      key,
      label,
      order,
      todos: [todo],
    });
  }

  for (const todo of todos) {
    switch (organizeBy) {
      case 'date': {
        const bucket = getDateBucket(todo, referenceDate);
        addGroup(bucket.key, bucket.label, bucket.order, todo);
        break;
      }
      case 'priority': {
        const bucket = getPriorityBucket(todo.priority);
        addGroup(bucket.key, bucket.label, bucket.order, todo);
        break;
      }
      case 'label': {
        const bucket = getLabelBucket(todo.labels);
        addGroup(bucket.key, bucket.label, bucket.order, todo);
        break;
      }
    }
  }

  return [...groups.values()]
    .sort((left, right) => {
      const orderDiff = left.order - right.order;
      if (orderDiff !== 0) return orderDiff;
      return left.label.localeCompare(right.label);
    })
    .map((group) => ({
      key: group.key,
      label: group.label,
      todos: sortTodos(group.todos),
    }));
}
