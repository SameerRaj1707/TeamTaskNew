import React, { useEffect, useState } from 'react';
import { STATUSES, dueInfo, formatMinutes } from '../utils.js';
import {
  BlockerIcon,
  CheckIcon,
  ClockIcon,
  FolderIcon,
  PlayIcon,
  PriorityIcon,
  StopIcon,
  UserIcon,
} from './Icons.jsx';

export default function TaskCard({ task, onOpen, onToggle, onStatus, onDelete, onLogTime }) {
  const done = task.status === 'done';
  const due = dueInfo(task.dueDate, done);
  const sub = task.subtasks || [];
  const subDone = sub.filter((s) => s.done).length;

  // Blocker detection
  const openDependencies = (task.dependencies || []).filter((d) => {
    if (typeof d === 'object' && d !== null) {
      return d.status !== 'done';
    }
    return false;
  });
  const isBlocked = openDependencies.length > 0;

  // Live stopwatch timer state
  const [timerActive, setTimerActive] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    let interval = null;
    if (timerActive) {
      interval = setInterval(() => {
        setElapsedSec((s) => s + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [timerActive]);

  const toggleTimer = (e) => {
    e.stopPropagation();
    if (timerActive) {
      const minutesToLog = Math.max(1, Math.round(elapsedSec / 60));
      if (onLogTime) {
        onLogTime(task, minutesToLog);
      }
      setTimerActive(false);
      setElapsedSec(0);
    } else {
      setTimerActive(true);
      setElapsedSec(0);
    }
  };

  const timerDisplay = () => {
    const m = Math.floor(elapsedSec / 60);
    const s = elapsedSec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const logged = task.loggedMinutes || 0;
  const est = task.estimateMinutes || 0;
  const isOverEstimated = est > 0 && logged > est;

  return (
    <article
      className={`dev-card prio-${task.priority} ${done ? 'is-done' : ''} ${isBlocked ? 'is-blocked' : ''}`}
    >
      <div className="dev-card-left">
        <button
          className={`dev-check ${done ? 'on' : ''}`}
          onClick={() => onToggle(task)}
          aria-label={done ? 'Mark as not done' : 'Mark as done'}
          aria-pressed={done}
        >
          {done && <CheckIcon size={12} />}
        </button>

        <span className="prio-indicator" title={`Priority: ${task.priority}`}>
          <PriorityIcon priority={task.priority} />
        </span>
      </div>

      <div
        className="dev-card-main"
        onClick={() => onOpen(task)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onOpen(task)}
      >
        <div className="card-header-line">
          <h3 className="card-title">{task.title}</h3>
        </div>

        {task.description && (
          <p className="card-desc">
            {task.description.replace(/^###.*$/gm, '').trim()}
          </p>
        )}

        <div className="dev-chips">
          {task.project && (
            <span className="dev-chip chip-project" title={`Project: ${task.project}`}>
              <FolderIcon size={12} />
              <span>{task.project}</span>
            </span>
          )}

          {task.assignee && (
            <span className="dev-chip chip-user" title={`Assigned to ${task.assignee}`}>
              <UserIcon size={12} />
              <span>{task.assignee}</span>
            </span>
          )}

          {isBlocked && (
            <span
              className="dev-chip chip-danger"
              title={`Blocked by ${openDependencies.length} unfinished prerequisite(s)`}
            >
              <BlockerIcon size={12} />
              <span>Blocked ({openDependencies.length})</span>
            </span>
          )}

          {due && (
            <span className={`dev-chip due-${due.tone}`}>
              <ClockIcon size={12} />
              <span>{due.text}</span>
            </span>
          )}

          {est > 0 && (
            <span
              className={`dev-chip ${isOverEstimated ? 'chip-overtime' : 'chip-time'}`}
              title="Time Logged vs Estimated"
            >
              <span>
                {formatMinutes(logged)} / {formatMinutes(est)}
              </span>
            </span>
          )}

          {sub.length > 0 && (
            <span className="dev-chip chip-subtasks" title="Subtask Progress">
              <span>
                {subDone}/{sub.length}
              </span>
            </span>
          )}

          {task.acceptanceCriteria?.length > 0 && (
            <span className="dev-chip chip-ac" title="Acceptance Criteria Defined">
              <span>{task.acceptanceCriteria.length} AC</span>
            </span>
          )}

          {(task.tags || []).map((t) => (
            <span key={t} className="dev-chip chip-tag">
              #{t}
            </span>
          ))}
        </div>

        {sub.length > 0 && (
          <div className="subtask-progress-bar">
            <div
              className="subtask-progress-fill"
              style={{ width: `${(subDone / sub.length) * 100}%` }}
            />
          </div>
        )}
      </div>

      <div className="dev-card-actions">
        <button
          type="button"
          className={`dev-timer-btn ${timerActive ? 'active' : ''}`}
          onClick={toggleTimer}
          title={timerActive ? 'Stop focus timer & log minutes' : 'Start real-time focus timer'}
        >
          {timerActive ? (
            <>
              <span className="recording-dot" />
              <span>{timerDisplay()}</span>
              <StopIcon size={10} />
            </>
          ) : (
            <>
              <PlayIcon size={10} />
              <span>Timer</span>
            </>
          )}
        </button>

        <select
          className="dev-status-select"
          value={task.status}
          onChange={(e) => onStatus(task, e.target.value)}
          aria-label="Status"
        >
          {STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        <button
          className="dev-delete-btn"
          onClick={() => onDelete(task)}
          aria-label="Delete task"
          title="Delete task"
        >
          ✕
        </button>
      </div>
    </article>
  );
}
