import { ClipboardCheck } from 'lucide-react';

import type { Todo } from '../types';
import { TodoItem } from './TodoItem';

interface TodoListProps {
  todos: Todo[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyTitle?: string;
  emptyHint?: string;
}

export function TodoList({
  todos,
  selectedId,
  onSelect,
  emptyTitle = 'No todos yet',
  emptyHint = 'Press n or click the input above to add one.',
}: TodoListProps) {
  if (todos.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-note" aria-hidden="true">
          <span className="empty-state-note__line" />
          <span className="empty-state-note__line" />
          <span className="empty-state-note__line" />
          <ClipboardCheck size={42} strokeWidth={1.5} className="empty-state-icon" aria-hidden="true" />
        </div>
        <p className="empty-state-kicker">Clean Desk</p>
        <p className="empty-state-title">{emptyTitle}</p>
        <p className="empty-state-hint">{emptyHint}</p>
      </div>
    );
  }

  return (
    <ul className="todo-list" role="list" aria-label="Todos">
      {todos.map((todo) => (
        <TodoItem
          key={todo.id}
          todo={todo}
          selected={selectedId === todo.id}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}
