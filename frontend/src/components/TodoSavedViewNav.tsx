import type { SavedTodoViewKey } from '../stores/todoWorkspace';
import { SAVED_TODO_VIEWS } from './todoViews';

interface TodoSavedViewNavProps {
  activeView: SavedTodoViewKey | null;
  counts: Record<SavedTodoViewKey, number>;
  totalCount: number;
  onSelectView: (view: SavedTodoViewKey | null) => void;
}

export function TodoSavedViewNav({
  activeView,
  counts,
  totalCount,
  onSelectView,
}: TodoSavedViewNavProps) {
  return (
    <nav className="todo-sidebar-nav todo-sidebar-nav--saved" aria-label="Saved todo views">
      <button
        className={`todo-sidebar-nav__item${
          activeView === null ? ' todo-sidebar-nav__item--active' : ''
        }`}
        type="button"
        onClick={() => onSelectView(null)}
        aria-pressed={activeView === null}
        title="Show all todos"
      >
        <span className="todo-sidebar-nav__label">All</span>
        <span className="todo-sidebar-nav__count">{totalCount}</span>
      </button>

      {SAVED_TODO_VIEWS.map((view) => {
        const active = activeView === view.key;
        return (
          <button
            key={view.key}
            className={`todo-sidebar-nav__item${
              active ? ' todo-sidebar-nav__item--active' : ''
            }`}
            type="button"
            onClick={() => onSelectView(view.key)}
            aria-pressed={active}
            title={view.description}
          >
            <span className="todo-sidebar-nav__label">{view.label}</span>
            <span className="todo-sidebar-nav__count">{counts[view.key]}</span>
          </button>
        );
      })}
    </nav>
  );
}
