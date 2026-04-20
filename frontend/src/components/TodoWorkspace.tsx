import { ArrowLeft, Menu, Plus } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import {
  getSavedViewCounts,
  getWorkspaceResult,
  type SavedTodoViewKey,
  TODO_WORKSPACE_ORGANIZE_OPTIONS,
  type TodoWorkspaceOrganizeKey,
} from '../stores/todoWorkspace';
import { TodoDetailPane, type TodoDetailPaneHandle } from './TodoDetailPane';
import { TodoInput, type TodoInputHandle } from './TodoInput';
import { TodoList } from './TodoList';
import { TodoSavedViewNav } from './TodoSavedViewNav';
import { TodoViewNav } from './TodoViewNav';
import {
  getTodoViewCounts,
  getViewTodos,
  type PlanningTodo,
  SAVED_TODO_VIEWS,
  TODO_VIEWS,
  type TodoViewKey,
} from './todoViews';

export interface TodoWorkspaceHandle {
  focusNewTodo(): void;
  focusDetailTitle(): void;
  focusSearch(): void;
}

interface TodoWorkspaceProps {
  todos: PlanningTodo[];
  loading: boolean;
  fetchError: string | null;
  onRetryFetch: () => void;
  selectedView: TodoViewKey;
  savedView: SavedTodoViewKey | null;
  searchQuery: string;
  organizeBy: TodoWorkspaceOrganizeKey;
  selectedId: string | null;
  onSignIn: () => void;
  onCreateTodo: (todo: PlanningTodo) => void;
  onSelectView: (view: TodoViewKey) => void;
  onSelectSavedView: (view: SavedTodoViewKey | null) => void;
  onSearchQueryChange: (query: string) => void;
  onOrganizeByChange: (view: TodoWorkspaceOrganizeKey) => void;
  onSelectTodo: (id: string) => void;
  onDeselectTodo: () => void;
}

const EMPTY_STATE_COPY: Record<TodoViewKey, { title: string; hint: string }> = {
  inbox: {
    title: 'Inbox is empty',
    hint: 'Capture something with n and triage it later.',
  },
  today: {
    title: "Nothing on today's list",
    hint: 'Tasks scheduled for today will show up here automatically.',
  },
  upcoming: {
    title: 'No upcoming tasks',
    hint: 'Schedule work into the future to populate this view.',
  },
  anytime: {
    title: 'No anytime tasks',
    hint: 'Open-ended tasks will appear here once they are marked as flexible.',
  },
  someday: {
    title: 'Nothing deferred',
    hint: 'Someday tasks are for ideas you want to keep without acting on yet.',
  },
  completed: {
    title: 'No completed tasks yet',
    hint: 'Finished work will collect here for reference.',
  },
};

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia('(max-width: 980px)').matches;
}

function getSavedViewLabel(view: SavedTodoViewKey | null): string | null {
  if (!view) return null;
  return SAVED_TODO_VIEWS.find((item) => item.key === view)?.label ?? null;
}

function getOrganizeLabel(view: TodoWorkspaceOrganizeKey): string {
  return TODO_WORKSPACE_ORGANIZE_OPTIONS.find((item) => item.key === view)?.label ?? view;
}

function getEmptyStateCopy(
  selectedView: TodoViewKey,
  savedView: SavedTodoViewKey | null,
  searchQuery: string,
): { title: string; hint: string } {
  const trimmedQuery = searchQuery.trim();
  if (trimmedQuery) {
    return {
      title: `No results for "${trimmedQuery}"`,
      hint: 'Clear the search or try a different title or description.',
    };
  }

  if (savedView) {
    const savedLabel = getSavedViewLabel(savedView) ?? 'this saved view';
    return {
      title: `No todos in ${savedLabel}`,
      hint: 'Clear the saved view or try a different retrieval filter.',
    };
  }

  return EMPTY_STATE_COPY[selectedView];
}


export const TodoWorkspace = forwardRef<TodoWorkspaceHandle, TodoWorkspaceProps>(function TodoWorkspace({
  todos,
  loading,
  fetchError,
  onRetryFetch,
  selectedView,
  savedView,
  searchQuery,
  organizeBy,
  selectedId,
  onSignIn: _onSignIn,
  onCreateTodo,
  onSelectView,
  onSelectSavedView,
  onSearchQueryChange,
  onOrganizeByChange,
  onSelectTodo,
  onDeselectTodo,
}: TodoWorkspaceProps, ref) {
  const todoInputRef = useRef<TodoInputHandle>(null);
  const todoDetailPaneRef = useRef<TodoDetailPaneHandle>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobileViewport());

  useImperativeHandle(ref, () => ({
    focusNewTodo() {
      todoInputRef.current?.focus();
    },
    focusDetailTitle() {
      todoDetailPaneRef.current?.focusTitle();
    },
    focusSearch() {
      searchInputRef.current?.focus();
    },
  }));

  const counts = getTodoViewCounts(todos);
  const baseViewTodos = getViewTodos(todos, selectedView);
  const savedViewCounts = getSavedViewCounts(baseViewTodos);
  const workspaceResult = getWorkspaceResult(todos, {
    selectedView,
    savedView,
    searchQuery,
    organizeBy,
  });
  const visibleTodos = workspaceResult.todos;
  const selectedTodo = todos.find((todo) => todo.id === selectedId) ?? null;
  const selectedViewLabel =
    TODO_VIEWS.find((view) => view.key === selectedView)?.label ?? selectedView;
  const todayLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date());
  const savedViewLabel = getSavedViewLabel(savedView);
  const organizeLabel = getOrganizeLabel(organizeBy);
  const emptyState = getEmptyStateCopy(selectedView, savedView, searchQuery);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 980px)');
    const handleViewportChange = () => {
      setSidebarOpen(!mediaQuery.matches);
    };

    handleViewportChange();
    mediaQuery.addEventListener('change', handleViewportChange);
    return () => mediaQuery.removeEventListener('change', handleViewportChange);
  }, []);


  function closeSidebarIfMobile() {
    if (isMobileViewport()) {
      setSidebarOpen(false);
    }
  }

  const countSummaryParts = [
    `${visibleTodos.length} todo${visibleTodos.length === 1 ? '' : 's'} in ${selectedViewLabel}`,
  ];

  if (savedViewLabel) {
    countSummaryParts.push(savedViewLabel);
  }

  if (searchQuery.trim()) {
    countSummaryParts.push(`Search "${searchQuery.trim()}"`);
  }

  if (organizeBy !== 'date') {
    countSummaryParts.push(`Grouped by ${organizeLabel}`);
  }

  const contextParts = [savedViewLabel].filter(Boolean);

  const listSurfaceKey = [
    selectedView,
    savedView ?? 'all',
    organizeBy,
    searchQuery.trim() ? 'search' : 'none',
  ].join(':');

  return (
    <main className="todo-main">
      <div
        className={`todo-shell${sidebarOpen ? ' todo-shell--sidebar-open' : ''}${selectedTodo ? ' todo-shell--detail-open' : ''}`}
      >
        <button
          className={`todo-sidebar-backdrop${sidebarOpen ? ' todo-sidebar-backdrop--visible' : ''}`}
          type="button"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
        />

        <aside className={`todo-sidebar${sidebarOpen ? ' todo-sidebar--open' : ''}`} aria-label="Workspace navigation">
          <div className="todo-sidebar__head">
            <h2 className="todo-sidebar__title">Workspace</h2>
            <button
              className="todo-sidebar__collapse"
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Collapse sidebar"
            >
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="todo-sidebar__search" aria-label="Search todos">
            <label className="form-label" htmlFor="todo-search-input">
              Search
            </label>
            <div className="todo-sidebar__search-row">
              <input
                ref={searchInputRef}
                id="todo-search-input"
                className="form-input"
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                placeholder="Search title or description"
                aria-label="Search todos"
              />
              {searchQuery.trim() && (
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  onClick={() => onSearchQueryChange('')}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <section className="todo-sidebar__section">
            <h3 className="todo-sidebar__section-title">Views</h3>
            <TodoViewNav
              activeView={selectedView}
              counts={counts}
              onSelectView={(view) => {
                onSelectView(view);
                closeSidebarIfMobile();
              }}
            />
          </section>

          <section className="todo-sidebar__section">
            <h3 className="todo-sidebar__section-title">Saved Views</h3>
            <TodoSavedViewNav
              activeView={savedView}
              counts={savedViewCounts}
              totalCount={baseViewTodos.length}
              onSelectView={(view) => {
                onSelectSavedView(view);
                closeSidebarIfMobile();
              }}
            />
          </section>
        </aside>

        <section className="todo-list-pane" aria-label="Todo list workspace">
          <header className="todo-list-pane__header">
            <div className="todo-list-pane__heading">
              <div className="todo-list-pane__eyebrow-row">
                {!sidebarOpen && (
                  <button
                    className="todo-list-pane__sidebar-inline-toggle"
                    type="button"
                    onClick={() => setSidebarOpen(true)}
                    aria-label="Expand workspace panel"
                  >
                    <Menu size={16} aria-hidden="true" />
                  </button>
                )}
                <p className="todo-list-pane__eyebrow">
                  {contextParts.length > 0 ? contextParts.join(' · ') : 'Your tasks'}
                </p>
                <span className="todo-list-pane__date-pill">{todayLabel}</span>
              </div>
              <h1 className="todo-list-pane__title">{selectedViewLabel}</h1>
              <p className="todo-list-pane__summary" aria-live="polite">
                {loading ? 'Loading…' : countSummaryParts.join(' · ')}
              </p>
            </div>

            <div className="todo-list-pane__header-actions">
              <div className="form-group form-group--inline">
                <label className="form-label" htmlFor="todo-organize-by">
                  Group by
                </label>
                <select
                  id="todo-organize-by"
                  className="form-input form-select form-select--compact"
                  value={organizeBy}
                  onChange={(e) =>
                    onOrganizeByChange(
                      (e.target as HTMLSelectElement).value as TodoWorkspaceOrganizeKey,
                    )
                  }
                >
                  {TODO_WORKSPACE_ORGANIZE_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </header>

          <TodoInput ref={todoInputRef} onCreated={onCreateTodo} />

          <section className="todo-list-pane__surface" key={listSurfaceKey}>
            {loading ? (
              <div className="todo-skeleton" aria-label="Loading todos" aria-busy="true">
                <div className="todo-skeleton__item" />
                <div className="todo-skeleton__item" />
                <div className="todo-skeleton__item todo-skeleton__item--short" />
                <div className="todo-skeleton__item" />
              </div>
            ) : fetchError ? (
              <div className="todo-fetch-error" role="alert">
                <p className="todo-fetch-error__message">{fetchError}</p>
                <button className="btn btn-secondary" type="button" onClick={onRetryFetch}>
                  Retry
                </button>
              </div>
            ) : visibleTodos.length === 0 ? (
              <TodoList
                todos={visibleTodos}
                selectedId={selectedId}
                onSelect={onSelectTodo}
                emptyTitle={emptyState.title}
                emptyHint={emptyState.hint}
              />
            ) : workspaceResult.sections.length > 1 ? (
              <div className="todo-group-list">
                {workspaceResult.sections.map((section) => (
                  <section key={section.key} className="todo-group" aria-label={section.label}>
                    <div className="todo-group__header">
                      <h3 className="todo-group__title">{section.label}</h3>
                      <span className="todo-group__count">{section.todos.length}</span>
                    </div>
                    <TodoList todos={section.todos} selectedId={selectedId} onSelect={onSelectTodo} />
                  </section>
                ))}
              </div>
            ) : (
              <TodoList
                todos={visibleTodos}
                selectedId={selectedId}
                onSelect={onSelectTodo}
                emptyTitle={emptyState.title}
                emptyHint={emptyState.hint}
              />
            )}
          </section>
        </section>

        <TodoDetailPane ref={todoDetailPaneRef} todo={selectedTodo} onClose={onDeselectTodo} />
      </div>

      <button
        className="todo-fab"
        type="button"
        aria-label="Add a new task"
        onClick={() => {
          todoInputRef.current?.focus();
        }}
      >
        <Plus size={24} aria-hidden="true" />
      </button>
    </main>
  );
});
