import { useSignals } from '@preact/signals-react/runtime';
import type { SubmitEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { authLoading, requestOtp, verifyOtp } from '../stores/auth';
import { fetchTodos } from '../stores/todos';

type Step = 'email' | 'code';

export function LoginPage() {
  useSignals();

  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleEmailSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await requestOtp(email);
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCodeSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await verifyOtp(email, code);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  function handleBack() {
    setStep('email');
    setCode('');
    setError(null);
  }

  async function handleAnonymous() {
    await fetchTodos();
    navigate('/');
  }

  if (authLoading.value) {
    return (
      <div className="login-page editorial-refresh">
        <div className="login-card">
          <div className="spinner" aria-label="Loading..." />
        </div>
      </div>
    );
  }

  return (
    <div className="login-page editorial-refresh">
      <div className="login-card">
        <div className="login-logo" aria-hidden="true">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
          </svg>
        </div>

        <h1 className="login-title">Not Now</h1>
        <p className="login-tagline">Organize work like a paper planner with keyboard-speed execution.</p>

        {step === 'email' ? (
          <form className="login-actions" onSubmit={handleEmailSubmit} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                className="form-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                autoFocus
              />
            </div>

            {error && (
              <p className="form-error" role="alert">{error}</p>
            )}

            <button
              className="btn btn-primary btn-block"
              type="submit"
              disabled={submitting}
            >
              {submitting ? 'Sending code…' : 'Send login code'}
            </button>
          </form>
        ) : (
          <form className="login-actions" onSubmit={handleCodeSubmit} noValidate>
            <p className="login-otp-hint">
              We sent a 6-digit code to <strong>{email}</strong>.{' '}
              <button className="login-otp-back" onClick={handleBack} type="button">
                Change email
              </button>
            </p>

            <div className="form-group">
              <label className="form-label" htmlFor="auth-code">Login code</label>
              <input
                id="auth-code"
                className="form-input login-otp-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                placeholder="000000"
                autoFocus
              />
            </div>

            {error && (
              <p className="form-error" role="alert">{error}</p>
            )}

            <button
              className="btn btn-primary btn-block"
              type="submit"
              disabled={submitting || code.length < 6}
            >
              {submitting ? 'Verifying…' : 'Verify code'}
            </button>
          </form>
        )}

        <div className="login-divider">
          <span>or</span>
        </div>

        <button
          className="btn btn-anonymous"
          onClick={handleAnonymous}
          type="button"
        >
          Continue without account
          <span className="login-anonymous-note">todos saved locally</span>
        </button>
      </div>
    </div>
  );
}
