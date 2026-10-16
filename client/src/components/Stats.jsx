import React from 'react';
import { addDays, localDateKey } from '../utils.js';
import { ChartIcon, CheckIcon, ClockIcon } from './Icons.jsx';

export default function Stats({ stats }) {
  if (!stats) {
    return (
      <section className="stats-dashboard skeleton-dashboard">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card chart-skeleton" />
      </section>
    );
  }

  const open = stats.status.todo + stats.status.in_progress;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(new Date(), i - 6);
    return {
      key: localDateKey(d),
      label: d.toLocaleDateString([], { weekday: 'narrow' }),
      dayNum: d.getDate(),
      n: stats.completedByDay[localDateKey(d)] || 0,
    };
  });
  const max = Math.max(1, ...days.map((d) => d.n));

  return (
    <section className="stats-dashboard">
      <div className="kpi-card">
        <div className="kpi-head">
          <span className="kpi-label">Active Work</span>
          <span className="kpi-badge kpi-badge-indigo">In Flight</span>
        </div>
        <div className="kpi-body">
          <span className="kpi-number">{open}</span>
          <span className="kpi-subtext">
            {stats.status.in_progress} in progress · {stats.status.todo} todo
          </span>
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-head">
          <span className="kpi-label">Due Today</span>
          <ClockIcon size={14} className="muted" />
        </div>
        <div className="kpi-body">
          <span className="kpi-number">{stats.dueToday}</span>
          <span className="kpi-subtext">Target deliverables</span>
        </div>
      </div>

      <div className={`kpi-card ${stats.overdue ? 'kpi-danger-card' : ''}`}>
        <div className="kpi-head">
          <span className="kpi-label">Overdue</span>
          {stats.overdue > 0 && <span className="kpi-badge kpi-badge-danger">Action Required</span>}
        </div>
        <div className="kpi-body">
          <span className={`kpi-number ${stats.overdue ? 'color-danger' : ''}`}>
            {stats.overdue}
          </span>
          <span className="kpi-subtext">
            {stats.overdue ? 'Past target SLA' : 'Zero overdue items'}
          </span>
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-head">
          <span className="kpi-label">Sprint Velocity</span>
          <CheckIcon size={14} className="color-ok" />
        </div>
        <div className="kpi-body">
          <div className="kpi-row">
            <span className="kpi-number">{stats.completionRate}%</span>
            {stats.totalLoggedHours !== undefined && (
              <span className="kpi-hours-pill">
                ⏱ {stats.totalLoggedHours}h / {stats.totalEstimateHours || 0}h
              </span>
            )}
          </div>
          <div className="kpi-progress-bar">
            <div
              className="kpi-progress-fill"
              style={{ width: `${stats.completionRate}%` }}
            />
          </div>
        </div>
      </div>

      <div className="kpi-card kpi-chart-card">
        <div className="kpi-head">
          <div className="kpi-chart-title">
            <ChartIcon size={14} />
            <span className="kpi-label">7-Day Velocity</span>
          </div>
          <span className="kpi-subtext">
            {stats.status.done} total done
          </span>
        </div>
        <div className="kpi-bars-container">
          {days.map((d) => (
            <div key={d.key} className="kpi-bar-col" title={`${d.n} completed on ${d.key}`}>
              <div className="kpi-bar-track">
                <div
                  className={`kpi-bar-fill ${d.n > 0 ? 'active' : ''}`}
                  style={{ height: `${Math.max(8, (d.n / max) * 100)}%` }}
                />
              </div>
              <span className="kpi-bar-label">{d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
