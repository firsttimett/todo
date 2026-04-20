import { useSignals } from '@preact/signals-react/runtime';
import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';

import { authLoading, initAuth } from '../stores/auth';
import { LoginPage } from './LoginPage';
import { TodoPage } from './TodoPage';

export function App() {
  useSignals();

  useEffect(() => {
    initAuth();
  }, []);

  if (authLoading.value) {
    return (
      <div className="app-loading" aria-label="Loading application">
        <div className="spinner spinner--lg" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            // Redirect unauthenticated users who haven't chosen anonymous mode.
            // Anonymous mode is detected by checking if there's no token but
            // the user explicitly navigated here (localStorage may have todos).
            // We allow access to "/" for anonymous users — the TodoPage shows the
            // anonymous banner. Redirect only when auth is definitely absent and
            // we're coming fresh (no todos in local storage).
            <TodoPage />
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="bottom-center" richColors duration={4000} />
    </BrowserRouter>
  );
}
