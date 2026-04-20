import { signal } from '@preact/signals-react';

import type { User } from '../types';

const AUTH_REFRESH_HINT_KEY = 'tfcd_auth_refresh_hint';

export const user = signal<User | null>(null);
export const accessToken = signal<string | null>(null);
export const authLoading = signal<boolean>(true);

function readAuthRefreshHint(): boolean {
  try {
    return localStorage.getItem(AUTH_REFRESH_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAuthRefreshHint(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(AUTH_REFRESH_HINT_KEY, '1');
      return;
    }
    localStorage.removeItem(AUTH_REFRESH_HINT_KEY);
  } catch {
    // Ignore storage access errors in private browsing or restricted contexts.
  }
}

export function markAuthRefreshExpected(): void {
  setAuthRefreshHint(true);
}

export async function initAuth(): Promise<void> {
  if (!readAuthRefreshHint()) {
    accessToken.value = null;
    user.value = null;
    authLoading.value = false;
    return;
  }

  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });

    if (res.ok) {
      const data = await res.json();
      accessToken.value = data.access_token ?? data.accessToken ?? null;
      user.value = data.user ?? null;
      setAuthRefreshHint(Boolean(accessToken.value));
    } else {
      accessToken.value = null;
      user.value = null;
      setAuthRefreshHint(false);
    }
  } catch {
    accessToken.value = null;
    user.value = null;
    setAuthRefreshHint(false);
  } finally {
    authLoading.value = false;
  }
}

export async function requestOtp(email: string): Promise<void> {
  const res = await fetch('/api/auth/otp/request', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? 'Failed to send code');
  }
}

export async function verifyOtp(email: string, code: string): Promise<void> {
  const res = await fetch('/api/auth/otp/verify', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail ?? 'Invalid or expired code');
  }

  accessToken.value = data.access_token ?? null;
  user.value = data.user ?? null;
  markAuthRefreshExpected();
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: accessToken.value
        ? { Authorization: `Bearer ${accessToken.value}` }
        : {},
    });
  } catch {
    // Ignore logout errors — clear state regardless
  } finally {
    accessToken.value = null;
    user.value = null;
    setAuthRefreshHint(false);
  }
}
