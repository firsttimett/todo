import { Trash2, X } from 'lucide-react';
import { forwardRef, type SubmitEvent, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { toast } from 'sonner';

import { deleteTodo, todos, toggleTodo, updateTodo } from '../stores/todos';
import { sortTodos } from '../stores/todoSorting';
import type {
  Priority,
  RecurrenceFrequency,
  TodoRecurrence,
  TodoReminder,
  TodoSubtask,
  UpdateTodoInput,
} from '../types';
import {
  getTodoDeadline,
  getTodoLabels,
  getTodoStartDate,
  getTodoView,
  type PlanningTodo,
  TODO_VIEWS,
} from './todoViews';

interface TodoDetailPaneProps {
  todo: PlanningTodo | null;
  onClose: () => void;
}

export interface TodoDetailPaneHandle {
  focusTitle(): void;
}

const STATUS_OPTIONS = TODO_VIEWS.filter((view) => view.key !== 'completed');
const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];
const SUBTASK_UNDO_TIMEOUT_MS = 5000;

type RecurrenceSelection = RecurrenceFrequency | 'none';

function joinLabels(labels: string[]): string {
  return labels.join(', ');
}

function splitLabels(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function createClientId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function sortSubtasks(items: TodoSubtask[]): TodoSubtask[] {
  return [...items].sort((left, right) => {
    const sortDiff = left.sort_order - right.sort_order;
    if (sortDiff !== 0) return sortDiff;
    return left.id.localeCompare(right.id);
  });
}

function sortReminders(items: TodoReminder[]): TodoReminder[] {
  return [...items].sort((left, right) => {
    const remindDiff = left.remind_at.localeCompare(right.remind_at);
    if (remindDiff !== 0) return remindDiff;
    return left.id.localeCompare(right.id);
  });
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function normalizeRecurrenceState(
  recurrence: TodoRecurrence | null,
): {
  frequency: RecurrenceSelection;
  interval: string;
  weekdays: number[];
  dayOfMonth: string;
} {
  if (!recurrence) {
    return {
      frequency: 'none',
      interval: '1',
      weekdays: [],
      dayOfMonth: '',
    };
  }

  return {
    frequency: recurrence.frequency,
    interval: String(Math.max(1, recurrence.interval)),
    weekdays: [...recurrence.weekdays].sort((left, right) => left - right),
    dayOfMonth: recurrence.day_of_month ? String(recurrence.day_of_month) : '',
  };
}

function buildRecurrencePayload(
  frequency: RecurrenceSelection,
  intervalValue: string,
  weekdays: number[],
  dayOfMonthValue: string,
): TodoRecurrence | null {
  if (frequency === 'none') return null;

  const parsedInterval = Number(intervalValue);
  const interval = Number.isFinite(parsedInterval) && parsedInterval >= 1 ? parsedInterval : 1;
  const payload: TodoRecurrence = {
    frequency,
    interval,
    weekdays: frequency === 'weekly' ? [...new Set(weekdays)].sort((left, right) => left - right) : [],
    day_of_month:
      frequency === 'monthly' && dayOfMonthValue.trim()
        ? Math.min(31, Math.max(1, Number(dayOfMonthValue)))
        : null,
  };

  if (frequency === 'monthly' && !Number.isFinite(payload.day_of_month)) {
    payload.day_of_month = null;
  }

  return payload;
}

function getNextSortOrder(items: TodoSubtask[]): number {
  return (
    Math.max(
      -1,
      ...items.map((item) => (Number.isFinite(item.sort_order) ? item.sort_order : -1)),
    ) + 1
  );
}

function getFrequencyUnit(frequency: RecurrenceSelection): string {
  switch (frequency) {
    case 'daily': return 'day(s)';
    case 'weekly': return 'week(s)';
    case 'monthly': return 'month(s)';
    case 'custom': return 'occurrence(s)';
    default: return '';
  }
}

export const TodoDetailPane = forwardRef<TodoDetailPaneHandle, TodoDetailPaneProps>(
  function TodoDetailPane({ todo, onClose }, ref) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState<Priority>('medium');
    const [status, setStatus] = useState<'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday'>('inbox');
    const [startDate, setStartDate] = useState('');
    const [deadline, setDeadline] = useState('');
    const [labels, setLabels] = useState('');
    const [sortOrder, setSortOrder] = useState('');
    const [completed, setCompleted] = useState(false);
    const [subtasks, setSubtasks] = useState<TodoSubtask[]>([]);
    const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
    const [recentlyDeletedSubtask, setRecentlyDeletedSubtask] = useState<TodoSubtask | null>(null);
    const [reminders, setReminders] = useState<TodoReminder[]>([]);
    const [newReminderAt, setNewReminderAt] = useState('');
    const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceSelection>('none');
    const [recurrenceInterval, setRecurrenceInterval] = useState('1');
    const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<number[]>([]);
    const [recurrenceDayOfMonth, setRecurrenceDayOfMonth] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const subtaskTitleInputRef = useRef<HTMLInputElement | null>(null);
    const subtaskUndoTimeoutRef = useRef<number | null>(null);

    useImperativeHandle(ref, () => ({
      focusTitle() {
        titleInputRef.current?.focus();
      },
    }));

    const completedSubtasks = subtasks.filter((subtask) => subtask.completed).length;
    const recurrenceSummary =
      recurrenceFrequency === 'none'
        ? 'No recurrence'
        : recurrenceFrequency.charAt(0).toUpperCase() + recurrenceFrequency.slice(1);

    useEffect(() => {
      clearSubtaskUndoTimeout();
      setIsDirty(false);

      if (!todo) {
        setTitle('');
        setDescription('');
        setPriority('medium');
        setStatus('inbox');
        setStartDate('');
        setDeadline('');
        setLabels('');
        setSortOrder('');
        setCompleted(false);
        setSubtasks([]);
        setNewSubtaskTitle('');
        setRecentlyDeletedSubtask(null);
        setReminders([]);
        setNewReminderAt('');
        setRecurrenceFrequency('none');
        setRecurrenceInterval('1');
        setRecurrenceWeekdays([]);
        setRecurrenceDayOfMonth('');
        setError(null);
        return;
      }

      setTitle(todo.title);
      setDescription(todo.description ?? '');
      setPriority(todo.priority);
      const derivedView = getTodoView(todo);
      setStatus(
        derivedView === 'completed'
          ? 'anytime'
          : (derivedView as 'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday'),
      );
      setStartDate(getTodoStartDate(todo) ?? '');
      setDeadline(getTodoDeadline(todo) ?? '');
      setLabels(joinLabels(getTodoLabels(todo)));
      setSortOrder(
        typeof todo.sort_order === 'number' && Number.isFinite(todo.sort_order)
          ? String(todo.sort_order)
          : '',
      );
      setCompleted(Boolean(todo.completed));
      setSubtasks(sortSubtasks(todo.subtasks ?? []));
      setNewSubtaskTitle('');
      setRecentlyDeletedSubtask(null);
      setReminders(sortReminders(todo.reminders ?? []));
      setNewReminderAt('');
      const recurrenceState = normalizeRecurrenceState(todo.recurrence ?? null);
      setRecurrenceFrequency(recurrenceState.frequency);
      setRecurrenceInterval(recurrenceState.interval);
      setRecurrenceWeekdays(recurrenceState.weekdays);
      setRecurrenceDayOfMonth(recurrenceState.dayOfMonth);
      setError(null);
    }, [todo]);

    useEffect(() => {
      return () => {
        if (subtaskUndoTimeoutRef.current !== null) {
          window.clearTimeout(subtaskUndoTimeoutRef.current);
        }
      };
    }, []);

    useEffect(() => {
      if (!todo) return;
      if (document.activeElement === document.body) {
        titleInputRef.current?.focus();
      }
    }, [todo]);

    function updateSubtasks(nextSubtasks: TodoSubtask[]) {
      setSubtasks(sortSubtasks(nextSubtasks));
    }

    function updateReminders(nextReminders: TodoReminder[]) {
      setReminders(sortReminders(nextReminders));
    }

    function clearSubtaskUndoTimeout() {
      if (subtaskUndoTimeoutRef.current !== null) {
        window.clearTimeout(subtaskUndoTimeoutRef.current);
        subtaskUndoTimeoutRef.current = null;
      }
    }

    function handleClose() {
      if (isDirty && !window.confirm('You have unsaved changes. Discard them?')) return;
      onClose();
    }

    function handleAddSubtask() {
      const trimmedTitle = newSubtaskTitle.trim();
      if (!trimmedTitle) return;
      setIsDirty(true);

      const nextSubtask: TodoSubtask = {
        id: createClientId('subtask'),
        title: trimmedTitle,
        completed: false,
        sort_order: getNextSortOrder(subtasks),
        completed_at: null,
      };

      updateSubtasks([...subtasks, nextSubtask]);
      setNewSubtaskTitle('');
      setRecentlyDeletedSubtask(null);
      clearSubtaskUndoTimeout();
      requestAnimationFrame(() => subtaskTitleInputRef.current?.focus());
    }

    function handleToggleSubtask(subtaskId: string) {
      setIsDirty(true);
      updateSubtasks(
        subtasks.map((subtask) =>
          subtask.id === subtaskId
            ? {
              ...subtask,
              completed: !subtask.completed,
              completed_at: subtask.completed ? null : new Date().toISOString(),
            }
            : subtask,
        ),
      );
    }

    function handleDeleteSubtask(subtaskId: string) {
      setIsDirty(true);
      const deletedSubtask = subtasks.find((subtask) => subtask.id === subtaskId);
      if (!deletedSubtask) return;

      updateSubtasks(subtasks.filter((subtask) => subtask.id !== subtaskId));
      setRecentlyDeletedSubtask(deletedSubtask);
      clearSubtaskUndoTimeout();
      subtaskUndoTimeoutRef.current = window.setTimeout(() => {
        setRecentlyDeletedSubtask(null);
        subtaskUndoTimeoutRef.current = null;
      }, SUBTASK_UNDO_TIMEOUT_MS);
    }

    function handleUndoDeleteSubtask() {
      if (!recentlyDeletedSubtask) return;
      setIsDirty(true);
      updateSubtasks([...subtasks, recentlyDeletedSubtask]);
      setRecentlyDeletedSubtask(null);
      clearSubtaskUndoTimeout();
      requestAnimationFrame(() => subtaskTitleInputRef.current?.focus());
    }

    function handleAddReminder() {
      setIsDirty(true);
      const trimmedValue = newReminderAt.trim();
      if (!trimmedValue) return;

      const remindAt = new Date(trimmedValue);
      if (Number.isNaN(remindAt.getTime())) return;

      const nextReminder: TodoReminder = {
        id: createClientId('reminder'),
        remind_at: remindAt.toISOString(),
        acknowledged_at: null,
      };

      updateReminders([...reminders, nextReminder]);
      setNewReminderAt('');
    }

    function handleDeleteReminder(reminderId: string) {
      setIsDirty(true);
      updateReminders(reminders.filter((reminder) => reminder.id !== reminderId));
    }

    function handleToggleWeekday(day: number) {
      setIsDirty(true);
      setRecurrenceWeekdays((current) =>
        current.includes(day)
          ? current.filter((weekday) => weekday !== day)
          : [...current, day].sort((left, right) => left - right),
      );
    }

    async function handleSave(e: SubmitEvent) {
      e.preventDefault();
      if (!todo) return;

      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        setError('Title is required.');
        return;
      }

      setSaving(true);
      setError(null);

      const normalizedLabels = splitLabels(labels);
      const normalizedDeadline = deadline.trim() || null;
      const normalizedStartDate = startDate.trim() || null;
      const normalizedSortOrder = sortOrder.trim() ? Number(sortOrder) : null;
      const completedAt = completed ? todo.completed_at ?? new Date().toISOString() : null;
      const derivedStatus = completed ? 'completed' : status;
      const nextSubtasks = sortSubtasks(subtasks);
      const nextReminders = sortReminders(reminders);
      const nextRecurrence = buildRecurrencePayload(
        recurrenceFrequency,
        recurrenceInterval,
        recurrenceWeekdays,
        recurrenceDayOfMonth,
      );

      try {
        const update: UpdateTodoInput = {
          title: trimmedTitle,
          description: description.trim(),
          priority,
          completed,
          completed_at: completedAt,
          start_date: normalizedStartDate,
          deadline: normalizedDeadline,
          labels: normalizedLabels,
          status: derivedStatus,
          sort_order: Number.isFinite(normalizedSortOrder ?? Number.NaN)
            ? (normalizedSortOrder ?? undefined)
            : undefined,
          subtasks: nextSubtasks,
          reminders: nextReminders,
          recurrence: nextRecurrence,
        };
        await updateTodo(todo.id, update);
        setIsDirty(false);
        toast.success('Changes saved', { duration: 2500 });
      } catch {
        setError('Failed to save. Please try again.');
      } finally {
        setSaving(false);
      }
    }

    async function handleToggleComplete() {
      if (!todo) return;
      const wasCompleted = todo.completed;
      await toggleTodo(todo.id);
      toast(`"${todo.title}" marked ${wasCompleted ? 'incomplete' : 'complete'}`, {
        duration: 7000,
        action: {
          label: 'Undo',
          onClick: () => toggleTodo(todo.id),
        },
      });
    }

    function handleDelete() {
      if (!todo) return;
      onClose();

      const snapshot = todos.value;
      const deletedTodo = todo;
      todos.value = snapshot.filter((t) => t.id !== deletedTodo.id);

      let undone = false;
      const timer = window.setTimeout(() => {
        if (!undone) {
          deleteTodo(deletedTodo.id).catch(() => {
            todos.value = sortTodos([...todos.value, deletedTodo]);
            toast.error('Failed to delete task. It has been restored.');
          });
        }
      }, 7000);

      toast(`"${deletedTodo.title}" deleted`, {
        duration: 7000,
        action: {
          label: 'Undo',
          onClick: () => {
            undone = true;
            clearTimeout(timer);
            todos.value = sortTodos([...todos.value, deletedTodo]);
          },
        },
      });
    }

    if (!todo) {
      return null;
    }

    const statusValue = getTodoView(todo);

    return (
      <>
        <button
          className="todo-detail-pane__backdrop todo-detail-pane__backdrop--visible"
          type="button"
          onClick={handleClose}
          aria-label="Close task details"
        />
        <aside
          className="todo-detail-pane todo-detail-pane--open"
          aria-label="Task details"
        >
          <div className="todo-detail-pane__shell">
            <div className="todo-detail-pane__header">
              <div>
                <h2 className="todo-detail-pane__title">{todo.title}</h2>
              </div>

              <button
                className="todo-detail-pane__close"
                type="button"
                onClick={handleClose}
                aria-label="Close task details"
              >
                <X size={16} aria-hidden="true" />
                <span className="todo-detail-pane__close-label">Close</span>
              </button>
            </div>

            <div className="todo-detail-pane__body">
              <form
                id="todo-detail-pane-form"
                className="todo-detail-pane__form"
                onSubmit={handleSave}
                onChange={() => setIsDirty(true)}
                noValidate
              >
                {error && <p className="form-error">{error}</p>}

                <div className="todo-detail-pane__summary">
                  <span className={`priority-badge priority-badge--${todo.priority}`}>
                    {todo.priority}
                  </span>
                  <span className="todo-detail-pane__status">{statusValue}</span>
                  {completed && <span className="todo-detail-pane__status">completed</span>}
                  <span className="todo-detail-pane__status">
                    Created {formatDateTime(todo.created_at)}
                  </span>
                  <span className="todo-detail-pane__status">
                    Updated {formatDateTime(todo.updated_at)}
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="todo-detail-title">
                    Title
                  </label>
                  <input
                    ref={titleInputRef}
                    id="todo-detail-title"
                    className="form-input"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Task title"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="todo-detail-description">
                    Description
                  </label>
                  <textarea
                    id="todo-detail-description"
                    className="form-input form-textarea"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add details..."
                    rows={4}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="todo-detail-priority">
                      Priority
                    </label>
                    <select
                      id="todo-detail-priority"
                      className="form-input form-select"
                      value={priority}
                      onChange={(e) =>
                        setPriority((e.target as HTMLSelectElement).value as Priority)
                      }
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="todo-detail-status">
                      When
                    </label>
                    <select
                      id="todo-detail-status"
                      className="form-input form-select"
                      value={status}
                      onChange={(e) =>
                        setStatus(
                          (e.target as HTMLSelectElement).value as
                          | 'inbox'
                          | 'today'
                          | 'upcoming'
                          | 'anytime'
                          | 'someday',
                        )
                      }
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <details className="detail-section">
                  <summary className="detail-section__toggle">Scheduling</summary>
                  <div className="detail-section__content">
                    <div className="form-row todo-detail-pane__schedule-dates-row">
                      <div className="form-group">
                        <label className="form-label" htmlFor="todo-detail-start">
                          Start date
                        </label>
                        <input
                          id="todo-detail-start"
                          className="form-input todo-detail-pane__schedule-date-input"
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="todo-detail-deadline">
                          Deadline
                        </label>
                        <input
                          id="todo-detail-deadline"
                          className="form-input todo-detail-pane__schedule-date-input"
                          type="date"
                          value={deadline}
                          onChange={(e) => setDeadline(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <p className="form-label">Recurrence</p>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label" htmlFor="todo-detail-recurrence-frequency">
                            Frequency
                          </label>
                          <select
                            id="todo-detail-recurrence-frequency"
                            className="form-input form-select"
                            value={recurrenceFrequency}
                            onChange={(e) =>
                              setRecurrenceFrequency(e.target.value as RecurrenceSelection)
                            }
                          >
                            <option value="none">None</option>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="custom">Custom</option>
                          </select>
                        </div>

                        {recurrenceFrequency !== 'none' && (
                          <div className="form-group">
                            <label className="form-label" htmlFor="todo-detail-recurrence-interval">
                              Repeat every
                            </label>
                            <div className="recurrence-interval-row">
                              <input
                                id="todo-detail-recurrence-interval"
                                className="form-input recurrence-interval-input"
                                type="number"
                                min="1"
                                inputMode="numeric"
                                value={recurrenceInterval}
                                onChange={(e) => setRecurrenceInterval(e.target.value)}
                              />
                              <span className="recurrence-unit">{getFrequencyUnit(recurrenceFrequency)}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {recurrenceFrequency === 'weekly' && (
                        <div className="form-group">
                          <p className="form-label">Weekdays</p>
                          <div className="form-row">
                            {WEEKDAY_OPTIONS.map((day) => {
                              const isSelected = recurrenceWeekdays.includes(day.value);
                              return (
                                <button
                                  key={day.value}
                                  className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                                  type="button"
                                  onClick={() => handleToggleWeekday(day.value)}
                                  aria-pressed={isSelected}
                                  aria-label={`Repeat on ${day.label}`}
                                >
                                  {day.label.slice(0, 3)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {recurrenceFrequency === 'monthly' && (
                        <div className="form-group">
                          <label className="form-label" htmlFor="todo-detail-recurrence-day">
                            Day of month
                          </label>
                          <input
                            id="todo-detail-recurrence-day"
                            className="form-input"
                            type="number"
                            min="1"
                            max="31"
                            inputMode="numeric"
                            value={recurrenceDayOfMonth}
                            onChange={(e) => setRecurrenceDayOfMonth(e.target.value)}
                          />
                        </div>
                      )}

                      <p className="todo-detail-pane__empty-hint">{recurrenceSummary}</p>
                    </div>

                    <div className="form-group">
                      <p className="form-label">Reminders</p>
                      <div className="todo-detail-pane__reminder-row">
                        <div className="form-group">
                          <label className="form-label" htmlFor="todo-detail-reminder-at">
                            Reminder date and time
                          </label>
                          <input
                            id="todo-detail-reminder-at"
                            className="form-input"
                            type="datetime-local"
                            value={newReminderAt}
                            onChange={(e) => setNewReminderAt(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddReminder();
                              }
                            }}
                          />
                        </div>
                        <div className="form-group todo-detail-pane__reminder-action">
                          <button
                            className="btn btn-secondary"
                            type="button"
                            aria-label="Add reminder"
                            onClick={handleAddReminder}
                            disabled={!newReminderAt.trim()}
                          >
                            + Add
                          </button>
                        </div>
                      </div>

                      {reminders.length > 0 ? (
                        <div className="todo-detail-pane__reminder-list">
                          {sortReminders(reminders).map((reminder) => (
                            <div className="form-row" key={reminder.id}>
                              <p className="todo-detail-pane__status">{formatDateTime(reminder.remind_at)}</p>
                              <button
                                className="btn btn-secondary"
                                type="button"
                                onClick={() => handleDeleteReminder(reminder.id)}
                                aria-label={`Delete reminder for ${formatDateTime(reminder.remind_at)}`}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="todo-detail-pane__empty-hint">No reminders yet.</p>
                      )}
                    </div>
                  </div>
                </details>

                <details className="detail-section">
                  <summary className="detail-section__toggle">Organization</summary>
                  <div className="detail-section__content">
                    <div className="form-group">
                      <label className="form-label" htmlFor="todo-detail-labels">
                        Labels
                      </label>
                      <input
                        id="todo-detail-labels"
                        className="form-input"
                        type="text"
                        value={labels}
                        onChange={(e) => setLabels(e.target.value)}
                        placeholder="Work, Design, Deep focus"
                      />
                    </div>
                    <div className="form-group form-group-inline">
                      <input
                        id="todo-detail-completed"
                        className="form-checkbox"
                        type="checkbox"
                        checked={completed}
                        onChange={(e) =>
                          setCompleted((e.target as HTMLInputElement).checked)
                        }
                      />
                      <label className="form-label form-label-inline" htmlFor="todo-detail-completed">
                        Mark as completed
                      </label>
                    </div>
                  </div>
                </details>

                <details className="detail-section">
                  <summary className="detail-section__toggle">
                    Subtasks {subtasks.length > 0 && <span className="detail-section__count">{completedSubtasks}/{subtasks.length}</span>}
                  </summary>
                  <div className="detail-section__content">
                    <div className="form-group">
                      <div className="form-row todo-detail-pane__subtask-input-row">
                        <div className="form-group todo-detail-pane__subtask-input-group">
                          <label className="form-label" htmlFor="todo-detail-new-subtask">
                            Subtask title
                          </label>
                          <input
                            id="todo-detail-new-subtask"
                            ref={subtaskTitleInputRef}
                            className="form-input"
                            type="text"
                            value={newSubtaskTitle}
                            onChange={(e) => setNewSubtaskTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddSubtask();
                              }
                            }}
                            placeholder="Add a subtask"
                          />
                        </div>
                        <div className="form-group todo-detail-pane__subtask-action">
                          <button
                            className="btn btn-secondary"
                            type="button"
                            aria-label="Add subtask"
                            onClick={handleAddSubtask}
                            disabled={!newSubtaskTitle.trim()}
                          >
                            + Add
                          </button>
                        </div>
                      </div>

                      {subtasks.length > 0 ? (
                        <div className="todo-detail-pane__subtask-list">
                          <p className="todo-detail-pane__status">
                            {completedSubtasks}/{subtasks.length} done
                          </p>
                          {subtasks.map((subtask) => (
                            <div className="form-row" key={subtask.id}>
                              <div className="form-group form-group-inline" style={{ flex: '1 1 auto' }}>
                                <input
                                  className="form-checkbox"
                                  type="checkbox"
                                  checked={subtask.completed}
                                  onChange={() => handleToggleSubtask(subtask.id)}
                                  aria-label={`Mark subtask ${subtask.title} ${subtask.completed ? 'incomplete' : 'complete'}`}
                                />
                                <span className={subtask.completed ? 'todo-item-title todo-item-title--done' : ''}>
                                  {subtask.title}
                                </span>
                              </div>
                              <button
                                className="btn btn-ghost btn-sm todo-detail-pane__subtask-delete"
                                type="button"
                                onClick={() => handleDeleteSubtask(subtask.id)}
                                aria-label={`Delete subtask ${subtask.title}`}
                              >
                                <Trash2 size={16} aria-hidden="true" />
                                <span className="sr-only">Delete subtask</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="todo-detail-pane__empty-hint">No subtasks yet.</p>
                      )}

                      {recentlyDeletedSubtask && (
                        <div className="todo-detail-pane__subtask-undo" role="status" aria-live="polite">
                          <span>Removed "{recentlyDeletedSubtask.title}".</span>
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            onClick={handleUndoDeleteSubtask}
                          >
                            Undo
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </details>
              </form>
            </div>

            <div className="todo-detail-pane__actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={handleToggleComplete}
                disabled={saving}
              >
                {completed ? 'Mark incomplete' : 'Mark complete'}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={handleDelete}
                disabled={saving}
              >
                Delete
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                form="todo-detail-pane-form"
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save'}{isDirty && !saving && <span className="todo-detail-pane__dirty-dot" aria-hidden="true" />}
              </button>
            </div>
          </div>
        </aside>
      </>
    );
  });
