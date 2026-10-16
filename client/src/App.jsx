import React, { useCallback, useEffect, useState } from 'react';
import { api, restoreSession, setAuthLostHandler, setToken } from './api.js';
import Auth from './components/Auth.jsx';
import { SparklesIcon } from './components/Icons.jsx';
import Tasks from './components/Tasks.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [aiProvider, setAiProvider] = useState(null);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');

  useEffect(() => {
    // Default to sleek dark mode if not explicitly set
    if (!document.documentElement.dataset.theme) {
      document.documentElement.dataset.theme = 'dark';
    }
    setAuthLostHandler(() => setUser(null));
    restoreSession().then((u) => {
      setUser(u);
      setBooting(false);
    });
  }, []);

  useEffect(() => {
    if (user) api.get('/ai/status').then((r) => setAiProvider(r.provider)).catch(() => {});
  }, [user]);

  const onAuth = useCallback((accessToken, u) => {
    setToken(accessToken);
    setUser(u);
  }, []);

  const signOut = async (everywhere) => {
    try {
      await (everywhere ? api.post('/auth/logout-all') : api.post('/auth/logout'));
    } catch {
      /* still sign out locally */
    }
    setToken(null);
    setUser(null);
  };

  const cycleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* ignore */
    }
  };

  if (booting) {
    return (
      <div className="dev-boot-screen">
        <div className="dev-boot-spinner" />
        <p className="muted">Initializing workspace…</p>
      </div>
    );
  }

  if (!user) return <Auth onAuth={onAuth} />;

  const userInitial = user.name ? user.name.charAt(0).toUpperCase() : 'U';

  return (
    <div className="app-container">
      <header className="dev-topbar">
        <div className="topbar-left">
          <div className="dev-brand-badge">
            <div className="dev-brand-icon">
              <SparklesIcon size={16} />
            </div>
            <span className="brand-text">TaskFlow <b className="ai-tag">AI</b></span>
          </div>

          <div className="workspace-pill" title="Active Workspace">
            <span className="ws-dot" />
            <span className="ws-name">Engineering Core</span>
          </div>
        </div>

        <div className="topbar-right">
          {aiProvider && (
            <div
              className={`dev-ai-status-pill ${aiProvider === 'claude' ? 'status-claude' : 'status-fallback'}`}
              title={
                aiProvider === 'claude'
                  ? 'Claude 3.5 Sonnet active'
                  : 'Built-in deterministic smart heuristics engine active'
              }
            >
              <span className="ai-status-dot" />
              <span>{aiProvider === 'claude' ? 'Claude Sonnet' : 'Smart Rules AI'}</span>
            </div>
          )}

          <button
            className="dev-icon-btn"
            onClick={cycleTheme}
            aria-label="Toggle theme"
            title={`Theme: ${theme}`}
          >
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>

          <details className="dev-menu">
            <summary className="dev-avatar-btn" aria-label="Account menu">
              <span className="user-avatar-circle">{userInitial}</span>
            </summary>
            <div className="dev-menu-dropdown">
              <div className="dropdown-user-header">
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>
              <div className="dropdown-divider" />
              <button className="dropdown-action" onClick={() => signOut(false)}>
                Sign out
              </button>
              <button className="dropdown-action" onClick={() => signOut(true)}>
                Sign out all devices
              </button>
            </div>
          </details>
        </div>
      </header>

      <Tasks />
    </div>
  );
}
