import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { errMsg, tzOffset } from '../utils.js';

export default function ExecutiveReportModal({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .post('/ai/executive-summary', { now: new Date().toISOString(), tzOffset: tzOffset() })
      .then((res) => {
        if (active) {
          setReport(res);
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

  const copyBriefing = async () => {
    if (!report) return;
    const text = [
      `📊 Sprint Executive Briefing — Health: ${report.sprintHealth} (${report.completionPercentage}% Complete)`,
      '',
      report.executiveSummary,
      '',
      'Key Milestones Delivered:',
      ...report.keyWins.map((k) => `• ${k}`),
      '',
      'Risk Radar & Recommendations:',
      ...report.riskRadar.map((r) => `• [${r.severity.toUpperCase()}] ${r.risk} -> Action: ${r.recommendation}`),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Unable to copy to clipboard');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet enterprise-modal" role="dialog" aria-modal="true" aria-label="Executive Briefing">
        <div className="sheet-head">
          <div className="modal-title-wrap">
            <h2>📊 Executive Sprint Health & Risk Radar</h2>
            <span className="pill pill-ai">Leadership Briefing</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {error && <pre className="error">{error}</pre>}

        {loading ? (
          <div className="center pad">
            <p className="muted">Analyzing sprint velocity, bottleneck risks, and delivery health…</p>
          </div>
        ) : report ? (
          <div className="exec-body">
            <div className="exec-top-metrics">
              <div
                className={`metric-card health-${report.sprintHealth === 'On Track' ? 'good' : report.sprintHealth === 'At Risk' ? 'warning' : 'danger'}`}
              >
                <span className="metric-label">Sprint Health</span>
                <span className="metric-value">{report.sprintHealth}</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Completion Velocity</span>
                <span className="metric-value">{report.completionPercentage}%</span>
              </div>
            </div>

            <div className="exec-section">
              <h4>Executive Summary</h4>
              <p className="exec-text">{report.executiveSummary}</p>
            </div>

            <div className="exec-section">
              <h4>🎯 Key Wins & Milestones</h4>
              <ul className="win-list">
                {report.keyWins.map((w, idx) => (
                  <li key={idx}>🏆 {w}</li>
                ))}
              </ul>
            </div>

            <div className="exec-section">
              <h4>🚨 Risk Radar & Bottlenecks</h4>
              <div className="radar-grid">
                {report.riskRadar.map((item, idx) => (
                  <div key={idx} className={`radar-card sev-${item.severity}`}>
                    <div className="radar-header">
                      <span className={`badge-sev sev-${item.severity}`}>{item.severity.toUpperCase()}</span>
                      <strong>{item.risk}</strong>
                    </div>
                    <p className="radar-rec">
                      <b>Action:</b> {item.recommendation}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="exec-section">
              <h4>💡 Strategic Leadership Recommendations</h4>
              <ul className="rec-list">
                {report.strategicRecommendations.map((r, idx) => (
                  <li key={idx}>📌 {r}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <div className="sheet-foot">
          <button type="button" className="btn ghost" onClick={handlePrint}>
            🖨️ Print / PDF
          </button>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={copyBriefing}
            disabled={!report}
          >
            {copied ? '✓ Copied Briefing!' : '📋 Copy Briefing'}
          </button>
        </div>
      </div>
    </div>
  );
}
