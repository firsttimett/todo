import { signal } from '@preact/signals-react';

import { authFetch } from '../services/api';
import type { CreateTodoInput, Todo, UpdateTodoInput } from '../types';
import { accessToken } from './auth';
import {
  buildTodoRecord,
  normalizeTodoRecord,
  normalizeTodos,
  todoSignature,
} from './todoNormalization';
import { sortTodos } from './todoSorting';

const LOCAL_STORAGE_KEY = 'tfcd_todos';

export const todos = signal<Todo[]>([]);
export const todosLoading = signal<boolean>(false);
export const todosError = signal<string | null>(null);

function generateId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function loadFromStorage(): Todo[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortTodos(normalizeTodos(parsed as Todo[]));
  } catch {
    return [];
  }
}

function saveToStorage(items: Todo[]): void {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
}

function clearStorage(): void {
  localStorage.removeItem(LOCAL_STORAGE_KEY);
}

function mergeTodoForWrite(
  todo: Todo,
  partial: UpdateTodoInput,
  now: string,
): CreateTodoInput {
  let status = partial.status ?? todo.status;
  let completed = partial.completed ?? todo.completed;

  if (partial.completed !== undefined) {
    completed = partial.completed;
    if (partial.completed) {
      status = 'completed';
    } else if (status === 'completed') {
      status = todo.status === 'completed' ? 'inbox' : todo.status;
    }
  } else if (status === 'completed') {
    completed = true;
  }

  return {
    title: partial.title ?? todo.title,
    description: partial.description ?? todo.description,
    priority: partial.priority ?? todo.priority,
    start_date: partial.start_date ?? todo.start_date,
    deadline: partial.deadline ?? todo.deadline,
    labels: partial.labels ?? todo.labels,
    status,
    sort_order: partial.sort_order ?? todo.sort_order,
    completed_at:
      partial.completed_at ?? (completed ? todo.completed_at ?? now : null),
    subtasks: partial.subtasks ?? todo.subtasks,
    reminders: partial.reminders ?? todo.reminders,
    recurrence: partial.recurrence ?? todo.recurrence,
    completed,
  };
}

function todoApiPayload(record: Todo): Omit<Todo, 'id' | 'created_at' | 'updated_at'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, created_at: _ca, updated_at: _ua, ...payload } = record;
  return payload;
}

async function loadRemoteTodos(): Promise<Todo[]> {
  const res = await authFetch('/api/todo/todos');
  if (!res.ok) throw new Error(`Failed to fetch todos: ${res.status}`);
  const data = await res.json();
  const items = Array.isArray(data)
    ? data
    : Array.isArray(data?.todos)
      ? data.todos
      : [];
  return sortTodos(normalizeTodos(items as Todo[]));
}

function getTodosToMigrate(localTodos: Todo[], remoteTodos: Todo[]): Todo[] {
  const remoteCounts = new Map<string, number>();

  for (const todo of remoteTodos) {
    const signature = todoSignature(todo);
    remoteCounts.set(signature, (remoteCounts.get(signature) ?? 0) + 1);
  }

  const pending: Todo[] = [];

  for (const todo of localTodos) {
    const signature = todoSignature(todo);
    const count = remoteCounts.get(signature) ?? 0;

    if (count > 0) {
      remoteCounts.set(signature, count - 1);
      continue;
    }

    pending.push(todo);
  }

  return pending;
}

async function migrateLocalTodos(remoteTodos: Todo[]): Promise<boolean> {
  const localTodos = loadFromStorage();
  if (localTodos.length === 0) return false;

  const pending = getTodosToMigrate(localTodos, remoteTodos);
  if (pending.length === 0) {
    clearStorage();
    return false;
  }

  for (const todo of pending) {
    const record = buildTodoRecord(todo, {
      id: todo.id,
      createdAt: todo.created_at,
      updatedAt: todo.updated_at,
      sortOrder: todo.sort_order,
    });

    const res = await authFetch('/api/todo/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(todoApiPayload(record)),
    });

    if (!res.ok) {
      throw new Error(`Failed to migrate todo: ${res.status}`);
    }
  }

  clearStorage();
  return true;
}

export async function fetchTodos(): Promise<void> {
  todosLoading.value = true;
  todosError.value = null;
  try {
    if (!accessToken.value) {
      const localTodos = loadFromStorage();
      todos.value = localTodos;
      if (localTodos.length > 0) {
        saveToStorage(localTodos);
      }
      return;
    }

    let remoteTodos = await loadRemoteTodos();
    const migrated = await migrateLocalTodos(remoteTodos);
    if (migrated) {
      remoteTodos = await loadRemoteTodos();
    }

    todos.value = remoteTodos;
  } catch (err) {
    console.error('fetchTodos error:', err);
    todosError.value = 'Failed to load tasks.';
  } finally {
    todosLoading.value = false;
  }
}

export async function createTodo(input: CreateTodoInput): Promise<Todo> {
  if (!accessToken.value) {
    const now = new Date().toISOString();
    const newTodo = buildTodoRecord(input, {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    });
    const updated = sortTodos([...todos.value, newTodo]);
    todos.value = updated;
    saveToStorage(updated);
    return newTodo;
  }

  const now = new Date().toISOString();
  const record = buildTodoRecord(input, {
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  });

  const res = await authFetch('/api/todo/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(todoApiPayload(record)),
  });

  if (!res.ok) throw new Error(`Failed to create todo: ${res.status}`);
  const createdTodo = normalizeTodoRecord(await res.json());
  const newTodo = createdTodo.id ? createdTodo : record;
  todos.value = sortTodos([newTodo, ...todos.value]);
  return newTodo;
}

export async function updateTodo(
  id: string,
  partial: UpdateTodoInput,
): Promise<void> {
  const currentTodo = todos.value.find((item) => item.id === id);
  if (!currentTodo) return;
  const now = new Date().toISOString();
  const nextInput = mergeTodoForWrite(currentTodo, partial, now);

  if (!accessToken.value) {
    const updated = todos.value.map((todo) =>
      todo.id === id
        ? buildTodoRecord(nextInput, {
            id: todo.id,
            createdAt: todo.created_at,
            updatedAt: now,
            sortOrder: nextInput.sort_order,
          })
        : todo,
    );
    const normalized = sortTodos(updated);
    todos.value = normalized;
    saveToStorage(normalized);
    return;
  }

  const res = await authFetch(`/api/todo/todos/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(nextInput),
  });

  if (!res.ok) throw new Error(`Failed to update todo: ${res.status}`);
  const updatedTodoCandidate = normalizeTodoRecord(await res.json());
  const updatedTodo = updatedTodoCandidate.id
    ? updatedTodoCandidate
    : buildTodoRecord(nextInput, {
        id: currentTodo.id,
        createdAt: currentTodo.created_at,
        updatedAt: now,
        sortOrder: nextInput.sort_order,
      });
  todos.value = sortTodos(
    todos.value.map((todo) => (todo.id === id ? updatedTodo : todo)),
  );
}

export async function deleteTodo(id: string): Promise<void> {
  if (!accessToken.value) {
    const updated = todos.value.filter((todo) => todo.id !== id);
    todos.value = updated;
    saveToStorage(updated);
    return;
  }

  const res = await authFetch(`/api/todo/todos/${id}`, {
    method: 'DELETE',
  });

  if (!res.ok) throw new Error(`Failed to delete todo: ${res.status}`);
  todos.value = todos.value.filter((todo) => todo.id !== id);
}

export async function toggleTodo(id: string): Promise<void> {
  const todo = todos.value.find((item) => item.id === id);
  if (!todo) return;
  await updateTodo(id, { completed: !todo.completed });
}
