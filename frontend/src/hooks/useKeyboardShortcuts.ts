import { useEffect } from 'react';

interface KeyboardShortcutOptions {
  onNewTodo?: () => void;
  onEditSelected?: () => void;
  onToggleDone?: () => void;
  onEscape?: () => void;
  onMoveSelectionUp?: () => void;
  onMoveSelectionDown?: () => void;
  onSearch?: () => void;
}

export function useKeyboardShortcuts(options: KeyboardShortcutOptions): void {
  const {
    onNewTodo,
    onEditSelected,
    onToggleDone,
    onEscape,
    onMoveSelectionUp,
    onMoveSelectionDown,
    onSearch,
  } = options;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      // Ignore shortcuts when typing in input/textarea/select elements
      const target = event.target as HTMLElement;
      const tag = target.tagName.toLowerCase();
      const isEditable =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target.isContentEditable;

      if (event.key === 'Escape') {
        onEscape?.();
        return;
      }

      // Only fire shortcuts when not focused in an editable element
      if (isEditable) return;

      switch (event.key) {
        case 'n':
        case 'N': {
          event.preventDefault();
          onNewTodo?.();
          break;
        }
        case 'e':
        case 'E': {
          event.preventDefault();
          onEditSelected?.();
          break;
        }
        case 'd':
        case 'D': {
          event.preventDefault();
          onToggleDone?.();
          break;
        }
        case 'ArrowUp': {
          event.preventDefault();
          onMoveSelectionUp?.();
          break;
        }
        case 'ArrowDown': {
          event.preventDefault();
          onMoveSelectionDown?.();
          break;
        }
        case '/': {
          event.preventDefault();
          onSearch?.();
          break;
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    onNewTodo,
    onEditSelected,
    onToggleDone,
    onEscape,
    onMoveSelectionUp,
    onMoveSelectionDown,
    onSearch,
  ]);
}
