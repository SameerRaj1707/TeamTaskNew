import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { errMsg, tzOffset } from '../utils.js';

export default function StandupModal({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [standup, setStandup] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .post('/ai/standup', { now: new Date().toISOString(), tzOffset: tzOffset() })
      .then((res) => {
        if (active) {
          setStandup(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(errMsg(err));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const copyToClipboard = async () => {
    if (!standup?.slackFormatted) return;
    try {
      await navigator.clipboard.writeText(standup.slackFormatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Unable to copy to clipboard.');
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet enterprise-modal" role="dialog" aria-modal="true" aria-label="Daily Standup">
        <div className="sheet-head">
          <div className="modal-title-wrap">
            <h2>📢 AI Daily Standup</h2>
            <span className="pill pill-ai">Instant Slack / Teams Sync</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {error && <pre className="error">{error}</pre>}

        {loading ? (
          <div className="center pad">
            <p className="muted">Compiling your sprint activity and daily status…</p>
          </div>
        ) : standup ? (
          <div className="standup-body">
            <div className="standup-section">
              <h4>✅ Done Yesterday / Recently</h4>
              <ul>
                {standup.yesterday.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="standup-section">
              <h4>🎯 Today's Focus</h4>
              <ul>
                {standup.today.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="standup-section">
              <h4>⚠️ Blockers & Risks</h4>
              <ul>
                {standup.blockers.map((item, idx) => (
                  <li key={idx} className={item.includes('⚠️') ? 'blocker-warn' : ''}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="slack-preview">
              <label>
                <strong>Slack / Teams Formatted Text</strong>
                <textarea readOnly rows={5} value={standup.slackFormatted} />
              </label>
            </div>
          </div>
        ) : null}

        <div className="sheet-foot">
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
          <span className="spacer" />
          <button
            type="button"
            className="btn primary"
            onClick={copyToClipboard}
            disabled={!standup}
          >
            {copied ? '✓ Copied to Clipboard!' : '📋 Copy for Slack / Teams'}
          </button>
        </div>
      </div>
    </div>
  );
}
