import { TODO_VIEWS, type TodoViewKey } from './todoViews';

interface TodoViewNavProps {
  activeView: TodoViewKey;
  counts: Record<TodoViewKey, number>;
  onSelectView: (view: TodoViewKey) => void;
}

export function TodoViewNav({
  activeView,
  counts,
  onSelectView,
}: TodoViewNavProps) {
  return (
    <nav className="todo-sidebar-nav" aria-label="Todo views">
      {TODO_VIEWS.map((view) => {
        const active = activeView === view.key;
        return (
          <button
            key={view.key}
            className={`todo-sidebar-nav__item${active ? ' todo-sidebar-nav__item--active' : ''}`}
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
