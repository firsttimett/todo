import type {
  CreateTodoInput,
  Priority,
  Todo,
  TodoRecurrence,
  TodoReminder,
  TodoStatus,
  TodoSubtask,
} from '../types';

type TodoRecordLike = Partial<Todo> & {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  labels?: string[];
  start_date?: string | null;
  deadline?: string | null;
  status?: TodoStatus | string;
  completed?: boolean;
  completed_at?: string | null;
  subtasks?: unknown;
  reminders?: unknown;
  recurrence?: unknown;
};

function isPriority(value: unknown): value is Priority {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isTodoStatus(value: unknown): value is TodoStatus {
  return (
    value === 'inbox' ||
    value === 'today' ||
    value === 'upcoming' ||
    value === 'anytime' ||
    value === 'someday' ||
    value === 'completed'
  );
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readDateOnly(value: unknown): string | null {
  const text = readText(value);
  return text ? text.slice(0, 10) : null;
}

function readTimestamp(value: unknown): string | null {
  const text = readText(value);
  return text ? text : null;
}

function readLabels(value: unknown): string[] {
  const normalized = new Set<string>();

  if (Array.isArray(value)) {
    for (const label of value) {
      const text = readText(label);
      if (text) normalized.add(text);
    }
  }

  return [...normalized];
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readStatus(value: unknown, completed: boolean): TodoStatus {
  if (isTodoStatus(value)) return value;
  return completed ? 'completed' : 'inbox';
}

function readSubtasks(value: unknown): TodoSubtask[] {
  if (!Array.isArray(value)) return [];

  const subtasks: TodoSubtask[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const id = readText(record.id);
    const title = readText(record.title);

    if (!id || !title) continue;

    const completed =
      Boolean(record.completed) || Boolean(readTimestamp(record.completed_at));

    subtasks.push({
      id,
      title,
      completed,
      sort_order: readNumber(record.sort_order),
      completed_at: completed ? readTimestamp(record.completed_at) : null,
    });
  }

  return subtasks.sort((left, right) => {
    const sortDiff = left.sort_order - right.sort_order;
    if (sortDiff !== 0) return sortDiff;
    return left.id.localeCompare(right.id);
  });
}

function readReminders(value: unknown): TodoReminder[] {
  if (!Array.isArray(value)) return [];

  const reminders: TodoReminder[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const id = readText(record.id);
    const remindAt = readTimestamp(record.remind_at);

    if (!id || !remindAt) continue;

    reminders.push({
      id,
      remind_at: remindAt,
      acknowledged_at: readTimestamp(record.acknowledged_at),
    });
  }

  return reminders.sort((left, right) => left.remind_at.localeCompare(right.remind_at));
}

function readRecurrence(value: unknown): TodoRecurrence | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  const frequency = readText(record.frequency);

  if (
    frequency !== 'daily' &&
    frequency !== 'weekly' &&
    frequency !== 'monthly' &&
    frequency !== 'custom'
  ) {
    return null;
  }

  const weekdays = Array.isArray(record.weekdays)
    ? [...new Set(record.weekdays.filter((day) => typeof day === 'number' && day >= 0 && day <= 6))]
    : [];
  const dayOfMonth =
    typeof record.day_of_month === 'number' &&
    Number.isFinite(record.day_of_month) &&
    record.day_of_month >= 1 &&
    record.day_of_month <= 31
      ? record.day_of_month
      : null;

  return {
    frequency,
    interval: Math.max(1, readNumber(record.interval, 1)),
    weekdays: frequency === 'weekly' ? weekdays.sort((left, right) => left - right) : [],
    day_of_month: frequency === 'monthly' ? dayOfMonth : null,
  };
}

function readSortOrder(value: unknown): number {
  return readNumber(value);
}

export function normalizeTodoRecord(record: TodoRecordLike): Todo {
  const title = readText(record.title);
  const description = readText(record.description);
  const priority = isPriority(record.priority) ? record.priority : 'low';
  const startDate = readDateOnly(record.start_date);
  const deadline = readDateOnly(record.deadline);
  const labels = readLabels(record.labels);
  const completed =
    Boolean(record.completed) ||
    record.status === 'completed' ||
    Boolean(record.completed_at);
  const status = readStatus(record.status, completed);
  const createdAt =
    readTimestamp(record.created_at) ??
    readTimestamp(record.updated_at) ??
    new Date().toISOString();
  const updatedAt = readTimestamp(record.updated_at) ?? createdAt;
  const completedAt = completed
    ? readTimestamp(record.completed_at) ?? updatedAt ?? createdAt
    : null;
  const subtasks = readSubtasks(record.subtasks);
  const reminders = readReminders(record.reminders);
  const recurrence = readRecurrence(record.recurrence);

  return {
    id: record.id,
    title,
    description,
    completed,
    priority,
    start_date: startDate,
    deadline,
    labels,
    status,
    sort_order: readSortOrder(record.sort_order),
    completed_at: completedAt,
    subtasks,
    reminders,
    recurrence,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export function normalizeTodos(records: unknown[]): Todo[] {
  return records.flatMap((record) => {
    if (!record || typeof record !== 'object') return [];

    const candidate = record as Partial<Todo> & {
      id?: unknown;
      title?: unknown;
    };

    if (typeof candidate.id !== 'string' || !candidate.id.trim()) return [];
    if (typeof candidate.title !== 'string' || !candidate.title.trim()) return [];

    return [normalizeTodoRecord(candidate as TodoRecordLike)];
  });
}

export function buildTodoRecord(
  input: CreateTodoInput,
  options: {
    id: string;
    createdAt: string;
    updatedAt?: string;
    sortOrder?: number | null;
  },
): Todo {
  const isCompleted = Boolean(input.completed) || Boolean(input.completed_at);

  return normalizeTodoRecord({
    id: options.id,
    title: input.title,
    description: input.description ?? '',
    completed: isCompleted,
    priority: input.priority ?? 'medium',
    start_date: input.start_date ?? null,
    deadline: input.deadline ?? null,
    labels: input.labels ?? [],
    status: input.status ?? (isCompleted ? 'completed' : 'inbox'),
    sort_order: input.sort_order ?? options.sortOrder ?? 0,
    completed_at: input.completed_at ?? (isCompleted ? options.createdAt : null),
    subtasks: input.subtasks ?? [],
    reminders: input.reminders ?? [],
    recurrence: input.recurrence ?? null,
    created_at: options.createdAt,
    updated_at: options.updatedAt ?? options.createdAt,
  });
}

export function todoSignature(record: TodoRecordLike): string {
  const normalized = normalizeTodoRecord(record);
  return JSON.stringify({
    title: normalized.title,
    description: normalized.description,
    completed: normalized.completed,
    priority: normalized.priority,
    start_date: normalized.start_date,
    deadline: normalized.deadline,
    labels: normalized.labels,
    status: normalized.status,
    subtasks: normalized.subtasks,
    reminders: normalized.reminders,
    recurrence: normalized.recurrence,
  });
}
