import { useEffect, useMemo, useState } from 'react';

import type { User } from '../types';
import { DarkModeToggle } from './DarkModeToggle';

interface TodoPageHeaderProps {
  user: User | null;
  isAnonymous: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

function resolveAvatarUrl(picture: string): string | null {
  const raw = picture.trim();
  if (!raw) return null;

  if (raw.startsWith('//')) {
    return `https:${raw}`;
  }

  try {
    const url = new URL(raw, window.location.origin);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return url.toString();
    }
  } catch {
    // Invalid URL values should fall back to placeholder avatar.
  }

  return null;
}

export function TodoPageHeader({
  user,
  isAnonymous,
  onSignIn,
  onSignOut,
}: TodoPageHeaderProps) {
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const todayLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date());
  const avatarUrl = useMemo(
    () => (user ? resolveAvatarUrl(user.picture ?? '') : null),
    [user],
  );
  const showAvatarImage = Boolean(user && avatarUrl && !avatarLoadFailed);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [avatarUrl]);

  return (
    <header className="todo-header">
      <div className="todo-header-left">
        <img className="todo-logo" src="/logo.svg" alt="Not Now logo" width={24} height={24} />
        <div className="todo-header-brand">
          <span className="todo-header-title">Not Now</span>
          <span className="todo-header-subtitle">todo planner</span>
        </div>
      </div>

      <div className="todo-header-right">
        <span className="todo-header-date" aria-label={`Today is ${todayLabel}`}>
          {todayLabel}
        </span>

        {isAnonymous && (
          <div className="todo-anon-controls">
            <span className="todo-anon-status" role="alert">
              anonymous mode
            </span>
            <button
              className="btn btn-primary btn-sm todo-anon-sync-btn"
              type="button"
              onClick={onSignIn}
            >
              Sign In to Sync
            </button>
          </div>
        )}

        {user && (
          <div className="user-info">
            {showAvatarImage ? (
              <img
                className="user-avatar"
                src={avatarUrl ?? undefined}
                alt={user.name}
                width={32}
                height={32}
                referrerPolicy="no-referrer"
                onError={() => setAvatarLoadFailed(true)}
              />
            ) : (
              <div className="user-avatar user-avatar--placeholder" aria-hidden="true">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="user-name">{user.name}</span>
          </div>
        )}

        {!isAnonymous && (
          <button className="btn btn-ghost btn-sm" type="button" onClick={onSignOut}>
            Sign out
          </button>
        )}

        <DarkModeToggle />
      </div>
    </header>
  );
}
