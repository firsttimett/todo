import { ArrowRight, Calendar, Circle, CircleCheck } from 'lucide-react';
import { type KeyboardEvent, type MouseEvent } from 'react';

import { toggleTodo } from '../stores/todos';
import {
  getTodoDeadline,
  getTodoLabels,
  getTodoStartDate,
  type PlanningTodo,
} from './todoViews';

interface TodoItemProps {
  todo: PlanningTodo;
  onSelect: (id: string) => void;
  selected: boolean;
}

function isOverdue(deadlineStr: string | null): boolean {
  if (!deadlineStr) return false;
  const due = new Date(deadlineStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year:
      d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

const PRIORITY_CONFIG: Record<PlanningTodo['priority'], { label: string; name: string }> = {
  high: { label: 'P1', name: 'High' },
  medium: { label: 'P2', name: 'Medium' },
  low: { label: 'P3', name: 'Low' },
};

export function TodoItem({ todo, onSelect, selected }: TodoItemProps) {
  const deadline = getTodoDeadline(todo);
  const startDate = getTodoStartDate(todo);
  const labels = getTodoLabels(todo);
  const completedSubtasks = todo.subtasks.filter((subtask) => subtask.completed).length;
  const hasSubtasks = todo.subtasks.length > 0;
  const overdue = isOverdue(deadline) && !todo.completed;
  const checkboxTone = overdue ? 'overdue' : todo.priority;
  const { label: priorityCode, name: priorityName } = PRIORITY_CONFIG[todo.priority];

  async function handleToggle(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    await toggleTodo(todo.id);
  }

  function handleSelect(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    onSelect(todo.id);
  }

  function handleRowClick() {
    onSelect(todo.id);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLLIElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(todo.id);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.nativeEvent.stopImmediatePropagation();
      const next = e.currentTarget.nextElementSibling as HTMLLIElement | null;
      if (next) {
        next.focus();
        const nextId = next.dataset.todoId;
        if (nextId) onSelect(nextId);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.nativeEvent.stopImmediatePropagation();
      const prev = e.currentTarget.previousElementSibling as HTMLLIElement | null;
      if (prev) {
        prev.focus();
        const prevId = prev.dataset.todoId;
        if (prevId) onSelect(prevId);
      }
    }
  }

  return (
    <li
      className={`todo-item${todo.completed ? ' todo-item--completed' : ''}${selected ? ' todo-item--selected' : ''}`}
      onClick={handleRowClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      data-todo-id={todo.id}
    >
      <div className="todo-item-left">
        <button
          className={`todo-checkbox todo-checkbox--${checkboxTone}`}
          type="button"
          onClick={handleToggle}
          aria-label={todo.completed ? 'Mark as incomplete' : 'Mark as complete'}
          aria-pressed={todo.completed}
        >
          {todo.completed ? (
            <CircleCheck size={20} aria-hidden="true" />
          ) : (
            <Circle size={20} aria-hidden="true" />
          )}
        </button>
      </div>

      <div className="todo-item-content">
        <span
          className={`todo-item-title${todo.completed ? ' todo-item-title--done' : ''}`}
        >
          {selected && <span className="sr-only">Selected. </span>}
          {todo.title}
        </span>

        {todo.description && (
          <p className="todo-item-description">{todo.description}</p>
        )}

        <div className="todo-item-meta">
          <span className="sr-only">Priority {priorityName}.</span>
          <span
            className={`todo-priority-badge todo-priority-badge--${overdue ? 'overdue' : todo.priority}`}
            aria-label={`Priority ${overdue ? 'Overdue' : priorityName}`}
            title={`Priority ${overdue ? 'Overdue' : priorityName}`}
          >
            <span className="todo-priority-badge__dot" aria-hidden="true" />
            {overdue ? 'Overdue' : `${priorityCode} ${priorityName}`}
          </span>

          {labels.map((label) => (
            <span key={label} className="label-chip">
              {label}
            </span>
          ))}

          {startDate && (
            <span className="date-chip" aria-label={`Start: ${formatDate(startDate)}`}>
              Starts {formatDate(startDate)}
            </span>
          )}

          {deadline && (
            <span
              className={`due-date${overdue ? ' due-date--overdue' : ''}`}
              aria-label={`Deadline: ${formatDate(deadline)}${overdue ? ' (overdue)' : ''}`}
            >
              <Calendar size={12} aria-hidden="true" />
              {formatDate(deadline)}
              {overdue && <span className="overdue-label"> Overdue</span>}
            </span>
          )}

          {hasSubtasks && (
            <span
              className="label-chip"
              aria-label={`${completedSubtasks} of ${todo.subtasks.length} subtasks complete`}
            >
              {completedSubtasks}/{todo.subtasks.length} done
            </span>
          )}
        </div>
      </div>

      <div className="todo-item-actions">
        <button
          className={`todo-action-btn todo-action-btn--open${selected ? ' todo-action-btn--open-active' : ''}`}
          type="button"
          onClick={handleSelect}
          aria-label={selected ? 'Hide details' : 'Open details'}
          title={selected ? 'Hide details' : 'Open details'}
          aria-pressed={selected}
        >
          <ArrowRight size={16} aria-hidden="true" />
        </button>

      </div>
    </li>
  );
}
