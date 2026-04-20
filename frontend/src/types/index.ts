export type Priority = 'low' | 'medium' | 'high';
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'custom';
export type TodoStatus =
  | 'inbox'
  | 'today'
  | 'upcoming'
  | 'anytime'
  | 'someday'
  | 'completed';

export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string | null;
}

export interface TodoSubtask {
  id: string;
  title: string;
  completed: boolean;
  sort_order: number;
  completed_at: string | null;
}

export interface TodoReminder {
  id: string;
  remind_at: string;
  acknowledged_at: string | null;
}

export interface TodoRecurrence {
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays: number[];
  day_of_month: number | null;
}

export interface Todo {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  priority: Priority;
  start_date: string | null;
  deadline: string | null;
  labels: string[];
  status: TodoStatus;
  sort_order: number;
  completed_at: string | null;
  subtasks: TodoSubtask[];
  reminders: TodoReminder[];
  recurrence: TodoRecurrence | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTodoInput {
  title: string;
  description?: string;
  priority?: Priority;
  start_date?: string | null;
  deadline?: string | null;
  labels?: string[];
  status?: TodoStatus;
  sort_order?: number | null;
  completed_at?: string | null;
  subtasks?: TodoSubtask[];
  reminders?: TodoReminder[];
  recurrence?: TodoRecurrence | null;
  completed?: boolean;
}

export type UpdateTodoInput = Partial<Omit<Todo, 'id' | 'created_at' | 'updated_at'>> & {
  sort_order?: number | null;
};
