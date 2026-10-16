import React from 'react';
import { formatMinutes } from '../utils.js';

export default function WorkloadView({ tasks, renderCard }) {
  const activeTasks = tasks.filter((t) => t.status !== 'done');

  // Group by assignee
  const groups = {};
  activeTasks.forEach((t) => {
    const key = t.assignee?.trim() || 'Unassigned';
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  const memberKeys = Object.keys(groups).sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="workload-container">
      <div className="workload-info-banner">
        <span>
          👥 <b>Team Workload & Capacity Radar</b>: Monitors resource allocation, tracks logged hours vs estimates, and warns of burnout risk before deadlines slip.
        </span>
      </div>

      {memberKeys.length === 0 ? (
        <div className="empty">
          <p className="muted">No active tasks assigned.</p>
        </div>
      ) : (
        <div className="workload-grid">
          {memberKeys.map((member) => {
            const memberTasks = groups[member];
            const totalEstMin = memberTasks.reduce((sum, t) => sum + (t.estimateMinutes || 0), 0);
            const totalLoggedMin = memberTasks.reduce((sum, t) => sum + (t.loggedMinutes || 0), 0);
            const totalHours = Math.round((totalEstMin / 60) * 10) / 10;
            const loggedHours = Math.round((totalLoggedMin / 60) * 10) / 10;

            const isBurnout = totalHours > 40;
            const isHeavy = totalHours > 30 && !isBurnout;

            const capacityPct = Math.min(100, Math.round((totalHours / 40) * 100));

            return (
              <div
                key={member}
                className={`workload-card ${isBurnout ? 'burnout-alert' : isHeavy ? 'heavy-alert' : ''}`}
              >
                <div className="workload-card-head">
                  <div className="member-avatar">
                    {member === 'Unassigned' ? '👤' : member.charAt(0).toUpperCase()}
                  </div>
                  <div className="member-info">
                    <h4>{member}</h4>
                    <span className="muted small-t">
                      {memberTasks.length} active task{memberTasks.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  {isBurnout ? (
                    <span className="badge-burnout">🚨 Burnout Risk</span>
                  ) : isHeavy ? (
                    <span className="badge-heavy">⚠️ Near Capacity</span>
                  ) : (
                    <span className="badge-balanced">✓ Balanced</span>
                  )}
                </div>

                <div className="capacity-bar-wrap">
                  <div className="capacity-labels">
                    <span>
                      Est: <b>{totalHours}h</b> / 40h week
                    </span>
                    <span className="muted">Logged: {loggedHours}h</span>
                  </div>
                  <div className="capacity-progress">
                    <div
                      className={`capacity-fill ${isBurnout ? 'fill-danger' : isHeavy ? 'fill-warning' : 'fill-ok'}`}
                      style={{ width: `${capacityPct}%` }}
                    />
                  </div>
                </div>

                <div className="workload-task-list">
                  {memberTasks.map(renderCard)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
