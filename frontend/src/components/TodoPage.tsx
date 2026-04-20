import { useSignals } from '@preact/signals-react/runtime';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { accessToken, logout, user } from '../stores/auth';
import { fetchTodos, todos, todosError, todosLoading, toggleTodo } from '../stores/todos';
import {
  getWorkspaceResult,
  loadTodoWorkspaceState,
  saveTodoWorkspaceState,
  type TodoWorkspaceState,
} from '../stores/todoWorkspace';
import { TodoPageHeader } from './TodoPageHeader';
import {
  getTodoView,
  type PlanningTodo,
} from './todoViews';
import { TodoWorkspace, type TodoWorkspaceHandle } from './TodoWorkspace';

export function TodoPage() {
  useSignals();

  const navigate = useNavigate();
  const workspaceRef = useRef<TodoWorkspaceHandle>(null);
  const [workspaceState, setWorkspaceState] = useState<TodoWorkspaceState>(() =>
    loadTodoWorkspaceState(),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isAnonymous = !accessToken.value;
  const planningTodos = todos.value as PlanningTodo[];
  const todosFetchError = todosError.value;
  const workspaceResult = getWorkspaceResult(planningTodos, workspaceState);
  const visibleTodos = workspaceResult.todos;

  useEffect(() => {
    fetchTodos();
  }, []);

  useEffect(() => {
    saveTodoWorkspaceState(workspaceState);
  }, [workspaceState]);

  useEffect(() => {
    if (selectedId && !visibleTodos.some((todo) => todo.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, visibleTodos]);

  function handleSelectTodo(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
  }

  function handleCreateTodo(todo: PlanningTodo) {
    setWorkspaceState((current) => ({
      ...current,
      selectedView: getTodoView(todo),
    }));
    setSelectedId(todo.id);
  }

  function moveSelection(direction: -1 | 1) {
    if (visibleTodos.length === 0) return;

    const currentIndex = selectedId
      ? visibleTodos.findIndex((todo) => todo.id === selectedId)
      : -1;

    if (currentIndex === -1) {
      const edgeTodo =
        direction > 0
          ? visibleTodos[0]
          : visibleTodos[visibleTodos.length - 1];
      setSelectedId(edgeTodo?.id ?? null);
      return;
    }

    const nextIndex = Math.min(
      Math.max(currentIndex + direction, 0),
      visibleTodos.length - 1,
    );
    setSelectedId(visibleTodos[nextIndex].id);
  }

  useKeyboardShortcuts({
    onNewTodo: () => workspaceRef.current?.focusNewTodo(),
    onEditSelected: () => workspaceRef.current?.focusDetailTitle(),
    onToggleDone: () => {
      if (selectedId) toggleTodo(selectedId);
    },
    onEscape: () => setSelectedId(null),
    onMoveSelectionUp: () => moveSelection(-1),
    onMoveSelectionDown: () => moveSelection(1),
    onSearch: () => workspaceRef.current?.focusSearch(),
  });

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className="todo-page editorial-refresh">
      <TodoPageHeader
        user={user.value}
        isAnonymous={isAnonymous}
        onSignIn={() => navigate('/login')}
        onSignOut={handleLogout}
      />

      <TodoWorkspace
        ref={workspaceRef}
        todos={planningTodos}
        loading={todosLoading.value}
        fetchError={todosFetchError}
        onRetryFetch={fetchTodos}
        selectedView={workspaceState.selectedView}
        savedView={workspaceState.savedView}
        searchQuery={workspaceState.searchQuery}
        organizeBy={workspaceState.organizeBy}
        selectedId={selectedId}
        onSignIn={() => navigate('/login')}
        onCreateTodo={handleCreateTodo}
        onSelectView={(view) =>
          setWorkspaceState((current) => ({ ...current, selectedView: view }))
        }
        onSelectSavedView={(view) =>
          setWorkspaceState((current) => ({ ...current, savedView: view }))
        }
        onSearchQueryChange={(query) =>
          setWorkspaceState((current) => ({ ...current, searchQuery: query }))
        }
        onOrganizeByChange={(view) =>
          setWorkspaceState((current) => ({ ...current, organizeBy: view }))
        }
        onSelectTodo={handleSelectTodo}
        onDeselectTodo={() => setSelectedId(null)}
      />

      <footer className="todo-footer">
        <p className="keyboard-hints">
          <kbd>n</kbd> new task &nbsp;&middot;&nbsp;
          <kbd>/</kbd> search &nbsp;&middot;&nbsp;
          <kbd>e</kbd> focus details &nbsp;&middot;&nbsp;
          <kbd>d</kbd> toggle done &nbsp;&middot;&nbsp;
          <kbd>↑</kbd>/<kbd>↓</kbd> move selection &nbsp;&middot;&nbsp;
          <kbd>Esc</kbd> deselect
        </p>
      </footer>
    </div>
  );
}
