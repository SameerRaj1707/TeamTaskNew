import React, { useState } from 'react';
import { api, ApiError } from '../api.js';
import { errMsg } from '../utils.js';
import { SparklesIcon } from './Icons.jsx';

export default function Auth({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = mode === 'login' ? { email: form.email, password: form.password } : form;
      const data = await api.post(`/auth/${mode}`, body);
      onAuth(data.accessToken, data.user);
    } catch (err) {
      setError(err instanceof ApiError ? errMsg(err) : 'Cannot reach the server. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dev-auth-page">
      <div className="dev-auth-ambient-glow" />

      <form className="dev-auth-card" onSubmit={submit} noValidate>
        <div className="dev-auth-brand">
          <div className="dev-auth-logo">
            <SparklesIcon size={22} />
          </div>
          <div className="dev-brand-text">
            <h2>TaskFlow <span className="dev-ai-badge">AI</span></h2>
            <p className="dev-brand-sub">Enterprise Sprint Intelligence & Adaptive Task Workspace</p>
          </div>
        </div>

        <div className="dev-auth-seg">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => setMode('login')}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => setMode('register')}
          >
            Create account
          </button>
        </div>

        {mode === 'register' && (
          <label className="dev-field">
            <span className="field-label">Full Name</span>
            <input
              className="dev-input"
              value={form.name}
              onChange={set('name')}
              autoComplete="name"
              required
              maxLength={80}
              placeholder="e.g. Alex Rivera"
            />
          </label>
        )}

        <label className="dev-field">
          <span className="field-label">Work Email</span>
          <input
            className="dev-input"
            type="email"
            value={form.email}
            onChange={set('email')}
            autoComplete="email"
            inputMode="email"
            required
            placeholder="name@company.com"
          />
        </label>

        <label className="dev-field">
          <span className="field-label">Password</span>
          <input
            className="dev-input"
            type="password"
            value={form.password}
            onChange={set('password')}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={8}
            placeholder="••••••••••••"
          />
        </label>

        {mode === 'register' && (
          <p className="dev-field-hint">At least 8 characters with a letter and a number.</p>
        )}

        {error && <pre className="dev-auth-error" role="alert">{error}</pre>}

        <button className="dev-submit-btn" disabled={busy}>
          {busy ? 'Authenticating…' : mode === 'login' ? 'Sign In to Workspace →' : 'Create Free Account →'}
        </button>

        <div className="dev-auth-footer">
          <span>Enterprise-grade security · JWT Memory Sessions · Zero IDOR</span>
        </div>
      </form>
    </div>
  );
}
