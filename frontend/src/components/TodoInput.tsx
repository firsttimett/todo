import { Plus } from 'lucide-react';
import { forwardRef, type KeyboardEvent, type SubmitEvent, useImperativeHandle, useRef, useState } from 'react';
import { toast } from 'sonner';

import { createTodo } from '../stores/todos';
import type { CreateTodoInput, Priority, Todo } from '../types';
import { parseQuickAddInput } from './todoQuickAddParser';

type PriorityOverride = '' | Priority;

interface TodoInputProps {
  onCreated?: (todo: Todo) => void;
}

export interface TodoInputHandle {
  focus(): void;
}

function splitLabels(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function mergeLabels(detectedLabels: string[], manualLabels: string): string[] {
  return [...new Set([...detectedLabels, ...splitLabels(manualLabels)])];
}

function formatDatePreview(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export const TodoInput = forwardRef<TodoInputHandle, TodoInputProps>(function TodoInput({ onCreated }, ref) {
  const newTodoInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus() {
      newTodoInputRef.current?.focus();
    },
  }));
  const [title, setTitle] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [description, setDescription] = useState('');
  const [priorityOverride, setPriorityOverride] = useState<PriorityOverride>('');
  const [startDateOverride, setStartDateOverride] = useState<string | null>(null);
  const [deadline, setDeadline] = useState('');
  const [labels, setLabels] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseQuickAddInput(title);
  const resolvedTitle = parsed.title || title.trim();
  const resolvedPriority = priorityOverride || parsed.priority || 'medium';
  const resolvedStartDate = startDateOverride ?? parsed.startDate ?? '';
  const resolvedLabels = mergeLabels(parsed.labels, labels);
  const hasParsedMetadata =
    Boolean(parsed.startDate) || Boolean(parsed.priority) || parsed.labels.length > 0;

  function reset() {
    setTitle('');
    setDescription('');
    setPriorityOverride('');
    setStartDateOverride(null);
    setDeadline('');
    setLabels('');
    setExpanded(false);
    setShowAdvanced(false);
    setError(null);
  }

  async function handleSubmit(e?: SubmitEvent) {
    e?.preventDefault();

    if (!resolvedTitle) {
      setError('Please enter a title.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const input: CreateTodoInput = {
        title: resolvedTitle,
        description: description.trim() || undefined,
        priority: resolvedPriority,
        start_date: resolvedStartDate || null,
        deadline: deadline || null,
        labels: resolvedLabels.length > 0 ? resolvedLabels : undefined,
        status: 'inbox',
      };
      const createdTodo = await createTodo(input);
      onCreated?.(createdTodo);
      reset();
      toast.success('Task added', { duration: 2500 });
    } catch {
      setError('Failed to create todo. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      if (expanded || title.trim()) {
        // Stop the global ESC handler from also deselecting a todo
        e.nativeEvent.stopImmediatePropagation();
        reset();
        newTodoInputRef.current?.blur();
      }
      // When empty + collapsed, let ESC propagate so global handler deselects the todo
    }
  }

  return (
    <form className="todo-input-form" onSubmit={handleSubmit} noValidate>
      {error && <p className="form-error">{error}</p>}

      <div className="todo-input-row">
        <input
          ref={newTodoInputRef}
          id="new-todo-input"
          className="todo-input-field"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setExpanded(true)}
          placeholder="Add a task..."
          aria-label="New todo title"
          autoComplete="off"
        />
        <button
          className="btn btn-primary todo-input-submit"
          type="submit"
          disabled={submitting}
          aria-label="Add todo"
          onClick={(e) => {
            if (!title.trim()) {
              e.preventDefault();
              newTodoInputRef.current?.focus();
            }
          }}
        >
          {submitting ? (
            <span className="spinner-sm" aria-hidden="true" />
          ) : (
            <Plus size={18} aria-hidden="true" />
          )}
        </button>
      </div>

      {hasParsedMetadata && (
        <div className="todo-input-insights" aria-live="polite">
          {resolvedStartDate && (
            <span className="todo-input-token todo-input-token--date">
              Date {formatDatePreview(resolvedStartDate)}
            </span>
          )}
          {(priorityOverride || parsed.priority) && (
            <span
              className={`todo-input-token todo-input-token--priority todo-input-token--${resolvedPriority}`}
            >
              Priority {resolvedPriority}
            </span>
          )}
          {parsed.labels.map((label) => (
            <span key={label} className="todo-input-token todo-input-token--label">
              #{label}
            </span>
          ))}
        </div>
      )}

      {expanded && (
        <div className="todo-input-expanded">
          <div className="todo-input-capture-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="new-start-date">
                Date
              </label>
              <input
                id="new-start-date"
                className="form-input"
                type="date"
                value={resolvedStartDate}
                onChange={(e) => setStartDateOverride(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="new-priority">
                Priority
              </label>
              <select
                id="new-priority"
                className="form-input form-select"
                value={priorityOverride || resolvedPriority}
                onChange={(e) =>
                  setPriorityOverride(
                    (e.target as HTMLSelectElement).value as PriorityOverride,
                  )
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="new-labels">
                Labels
              </label>
              <input
                id="new-labels"
                className="form-input"
                type="text"
                value={labels}
                onChange={(e) => setLabels(e.target.value)}
                placeholder="work, personal"
              />
            </div>
          </div>

          <div className="todo-input-secondary-actions">
            <p className="todo-input-hint">
              Natural language: tomorrow, friday, next week, p1, high, #label
            </p>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => setShowAdvanced((value) => !value)}
              aria-expanded={showAdvanced}
            >
              {showAdvanced ? 'Hide details' : 'More details'}
            </button>
          </div>

          {showAdvanced && (
            <div className="todo-input-advanced">
              <div className="form-group">
                <label className="form-label" htmlFor="new-description">
                  Description
                </label>
                <textarea
                  id="new-description"
                  className="form-input form-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description (optional)"
                  rows={3}
                  aria-label="Todo description"
                />
              </div>

              <div className="todo-input-extras">
                <div className="form-group">
                  <label className="form-label" htmlFor="new-deadline">
                    Deadline
                  </label>
                  <input
                    id="new-deadline"
                    className="form-input"
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="todo-input-expanded-actions">
            <button className="btn btn-ghost" type="button" onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </form>
  );
});
