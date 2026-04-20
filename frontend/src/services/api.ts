import { accessToken, setAuthRefreshHint, user } from '../stores/auth';

async function refreshTokens(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return false;
    const data = await res.json();
    const token = data.access_token ?? data.accessToken ?? null;
    if (token) {
      accessToken.value = token;
      user.value = data.user ?? user.value;
      setAuthRefreshHint(true);
      return true;
    }
    setAuthRefreshHint(false);
    return false;
  } catch {
    setAuthRefreshHint(false);
    return false;
  }
}

export async function authFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = accessToken.value;

  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, { ...init, headers });

  if (response.status === 401) {
    // Attempt token refresh once
    const refreshed = await refreshTokens();
    if (refreshed && accessToken.value) {
      headers.set('Authorization', `Bearer ${accessToken.value}`);
      return fetch(path, { ...init, headers });
    }
    // Refresh failed — clear auth state
    accessToken.value = null;
  }

  return response;
}
