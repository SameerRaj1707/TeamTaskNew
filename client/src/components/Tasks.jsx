import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, qs } from '../api.js';
import {
  STATUSES,
  PRIORITIES,
  addDays,
  endOfDay,
  errMsg,
  exportCsv,
  startOfDay,
  timeZone,
  tzOffset,
} from '../utils.js';
import ExecutiveReportModal from './ExecutiveReportModal.jsx';
import {
  ChartIcon,
  DownloadIcon,
  SearchIcon,
  SparklesIcon,
  StandupIcon,
} from './Icons.jsx';
import MatrixView from './MatrixView.jsx';
import StandupModal from './StandupModal.jsx';
import Stats from './Stats.jsx';
import TaskCard from './TaskCard.jsx';
import TaskModal from './TaskModal.jsx';
import WorkloadView from './WorkloadView.jsx';

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const WHEN = [
  { id: '', label: 'All Due Dates' },
  { id: 'today', label: 'Due Today' },
  { id: 'week', label: 'Next 7 Days' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'nodue', label: 'No Date' },
];

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState(null);
  const [standupOpen, setStandupOpen] = useState(false);
  const [execOpen, setExecOpen] = useState(false);

  const [filters, setFilters] = useState({
    q: '',
    status: '',
    priority: '',
    project: '',
    assignee: '',
    when: '',
    hasBlockers: false,
    sort: 'createdAt',
    order: 'desc',
  });

  const [view, setView] = useState(() => (window.innerWidth >= 900 ? 'board' : 'list'));
  const [quick, setQuick] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);
  const [plan, setPlan] = useState(null);
  const [planBusy, setPlanBusy] = useState(false);

  const dq = useDebounced(filters.q, 300);
  const flash = useCallback((m) => {
    setToast(m);
    setTimeout(() => setToast(''), 2500);
  }, []);

  const query = useMemo(() => {
    const p = {
      limit: 200,
      sort: filters.sort,
      order: filters.order,
      q: dq,
      priority: filters.priority,
    };
    if (view === 'list') p.status = filters.status;
    if (filters.project) p.project = filters.project;
    if (filters.assignee) p.assignee = filters.assignee;
    if (filters.hasBlockers) p.hasBlockers = 'true';

    const now = new Date();
    if (filters.when === 'today') {
      Object.assign(p, { dueFrom: startOfDay(now).toISOString(), dueTo: endOfDay(now).toISOString() });
    }
    if (filters.when === 'week') {
      Object.assign(p, { dueFrom: startOfDay(now).toISOString(), dueTo: endOfDay(addDays(now, 6)).toISOString() });
    }
    if (filters.when === 'overdue') p.overdue = 'true';
    if (filters.when === 'nodue') p.noDue = 'true';
    return qs(p);
  }, [
    dq,
    filters.priority,
    filters.status,
    filters.project,
    filters.assignee,
    filters.hasBlockers,
    filters.when,
    filters.sort,
    filters.order,
    view,
  ]);

  const loadTasks = useCallback(async () => {
    try {
      const r = await api.get(`/tasks${query}`);
      setTasks(r.items);
      setError('');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [query]);

  const loadStats = useCallback(async () => {
    try {
      const now = new Date();
      setStats(
        await api.get(
          `/tasks/stats${qs({
            tz: timeZone(),
            dayStart: startOfDay(now).toISOString(),
            dayEnd: endOfDay(now).toISOString(),
          })}`
        )
      );
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const refresh = () => Promise.all([loadTasks(), loadStats()]);

  const saveTask = async (data) => {
    const t = modal.task;
    if (t._id) await api.patch(`/tasks/${t._id}`, data);
    else await api.post('/tasks', data);
    setModal(null);
    flash(t._id ? 'Task updated' : 'Task created');
    refresh();
  };

  const removeTask = async (t) => {
    if (!window.confirm(`Delete "${t.title}"?`)) return;
    try {
      await api.del(`/tasks/${t._id}`);
      setModal(null);
      flash('Task deleted');
      refresh();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const setStatus = async (t, status) => {
    setTasks((list) => list.map((x) => (x._id === t._id ? { ...x, status } : x)));
    try {
      await api.patch(`/tasks/${t._id}`, { status });
      loadStats();
      if (filters.status && filters.status !== status && view === 'list') loadTasks();
    } catch (e) {
      setError(errMsg(e));
      loadTasks();
    }
  };

  const toggle = (t) => setStatus(t, t.status === 'done' ? 'todo' : 'done');

  const handleLogTime = async (t, minutes) => {
    try {
      const res = await api.post(`/tasks/${t._id}/log-time`, {
        minutes,
        note: 'Live focus timer',
      });
      setTasks((list) =>
        list.map((x) => (x._id === t._id ? { ...x, loggedMinutes: res.loggedMinutes } : x))
      );
      flash(`Logged ${minutes}m to "${t.title}"`);
      loadStats();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const clearDone = async () => {
    if (!window.confirm('Delete all completed tasks?')) return;
    try {
      const r = await api.del('/tasks/completed');
      flash(`Removed ${r.deleted} completed task${r.deleted === 1 ? '' : 's'}`);
      refresh();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const quickAdd = async (e) => {
    e.preventDefault();
    const text = quick.trim();
    if (text.length < 2) return;
    setQuickBusy(true);
    setError('');
    try {
      const r = await api.post('/ai/parse', { text, now: new Date().toISOString(), tzOffset: tzOffset() });
      setModal({ task: r.task, aiSource: r.source });
      setQuick('');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setQuickBusy(false);
    }
  };

  const makePlan = async () => {
    setPlanBusy(true);
    setError('');
    try {
      setPlan(await api.post('/ai/plan', { now: new Date().toISOString(), tzOffset: tzOffset() }));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setPlanBusy(false);
    }
  };

  const openById = (id) => {
    const t = tasks.find((x) => x._id === id);
    if (t) setModal({ task: t });
  };

  const setF = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  const card = (t) => (
    <TaskCard
      key={t._id}
      task={t}
      onOpen={(x) => setModal({ task: x })}
      onToggle={toggle}
      onStatus={setStatus}
      onDelete={removeTask}
      onLogTime={handleLogTime}
    />
  );

  const doneCount = stats?.status.done || 0;

  const projectOptions = useMemo(() => {
    const set = new Set();
    if (stats?.projects) stats.projects.forEach((p) => set.add(p));
    tasks.forEach((t) => t.project && set.add(t.project));
    return Array.from(set).sort();
  }, [stats?.projects, tasks]);

  const assigneeOptions = useMemo(() => {
    const set = new Set();
    if (stats?.workload) Object.keys(stats.workload).forEach((k) => k !== 'Unassigned' && set.add(k));
    tasks.forEach((t) => t.assignee && set.add(t.assignee));
    return Array.from(set).sort();
  }, [stats?.workload, tasks]);

  return (
    <main className="dev-main">
      <Stats stats={stats} />

      {/* AI Prompt Command Bar (Raycast / Linear style) */}
      <section className="command-bar-section">
        <form className="dev-command-bar" onSubmit={quickAdd}>
          <div className="command-spark-icon">
            <SparklesIcon size={18} />
          </div>
          <input
            className="command-input"
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            placeholder='Ask AI to schedule, break down or create tasks: "Deploy payment gateway Friday 5pm urgent #api"...'
            maxLength={500}
            aria-label="Ask AI to create or schedule a task"
          />
          <div className="command-actions">
            <button
              type="submit"
              className="dev-primary-btn"
              disabled={quickBusy || quick.trim().length < 2}
            >
              {quickBusy ? (
                <>
                  <span className="spinner-mini" />
                  <span>Reasoning…</span>
                </>
              ) : (
                <>
                  <SparklesIcon size={14} />
                  <span>Add with AI</span>
                </>
              )}
            </button>
            <button
              type="button"
              className="dev-ghost-btn"
              onClick={() => setModal({ task: {} })}
            >
              + Manual
            </button>
          </div>
        </form>
      </section>

      {/* Enterprise Fast Action HUD */}
      <div className="enterprise-hud">
        <div className="hud-actions-left">
          <button
            type="button"
            className="hud-btn"
            onClick={() => setStandupOpen(true)}
            title="Generate 1-click Slack/Teams standup update"
          >
            <StandupIcon size={14} />
            <span>Daily Standup</span>
          </button>
          <button
            type="button"
            className="hud-btn"
            onClick={() => setExecOpen(true)}
            title="Generate Executive Sprint Health & Risk Radar Briefing"
          >
            <ChartIcon size={14} />
            <span>Executive Radar</span>
          </button>
          <button
            type="button"
            className="hud-btn"
            onClick={() => {
              exportCsv(tasks);
              flash(`Exported ${tasks.length} tasks to CSV`);
            }}
            title="Export full task list to CSV"
          >
            <DownloadIcon size={14} />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            className="hud-btn hud-btn-ai"
            onClick={makePlan}
            disabled={planBusy}
          >
            <SparklesIcon size={14} />
            <span>{planBusy ? 'Planning…' : 'Plan My Day'}</span>
          </button>
        </div>
      </div>

      {/* Workspace Filter & View Controls */}
      <div className="dev-toolbar">
        <div className="search-wrap">
          <SearchIcon size={15} className="search-icon" />
          <input
            className="dev-search"
            type="search"
            placeholder="Search tasks, descriptions, tags, assignees…"
            value={filters.q}
            onChange={setF('q')}
            aria-label="Search tasks"
          />
        </div>

        <div className="filter-group">
          <select
            className="dev-select"
            value={filters.when}
            onChange={setF('when')}
            aria-label="Due date filter"
          >
            {WHEN.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>

          <select
            className="dev-select"
            value={filters.priority}
            onChange={setF('priority')}
            aria-label="Priority filter"
          >
            <option value="">All Priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)} Priority
              </option>
            ))}
          </select>

          {projectOptions.length > 0 && (
            <select
              className="dev-select"
              value={filters.project}
              onChange={setF('project')}
              aria-label="Project filter"
            >
              <option value="">All Projects</option>
              {projectOptions.map((proj) => (
                <option key={proj} value={proj}>
                  📁 {proj}
                </option>
              ))}
            </select>
          )}

          {assigneeOptions.length > 0 && (
            <select
              className="dev-select"
              value={filters.assignee}
              onChange={setF('assignee')}
              aria-label="Assignee filter"
            >
              <option value="">All Assignees</option>
              {assigneeOptions.map((a) => (
                <option key={a} value={a}>
                  👤 {a}
                </option>
              ))}
            </select>
          )}

          {view === 'list' && (
            <select
              className="dev-select"
              value={filters.status}
              onChange={setF('status')}
              aria-label="Status filter"
            >
              <option value="">All Statuses</option>
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          )}

          <select
            className="dev-select"
            value={`${filters.sort}:${filters.order}`}
            onChange={(e) => {
              const [sort, order] = e.target.value.split(':');
              setFilters((f) => ({ ...f, sort, order }));
            }}
            aria-label="Sort"
          >
            <option value="createdAt:desc">Newest First</option>
            <option value="dueDate:asc">Due Soonest</option>
            <option value="priority:desc">Highest Priority</option>
            <option value="estimateMinutes:desc">Largest Estimate</option>
            <option value="loggedMinutes:desc">Most Time Logged</option>
            <option value="title:asc">Alphabetical (A-Z)</option>
          </select>
        </div>

        {/* View Switcher: List, Board, Matrix, Workload */}
        <div className="dev-view-switcher">
          <button
            className={`view-tab ${view === 'list' ? 'active' : ''}`}
            onClick={() => setView('list')}
          >
            List
          </button>
          <button
            className={`view-tab ${view === 'board' ? 'active' : ''}`}
            onClick={() => setView('board')}
          >
            Board
          </button>
          <button
            className={`view-tab ${view === 'matrix' ? 'active' : ''}`}
            onClick={() => setView('matrix')}
          >
            Matrix
          </button>
          <button
            className={`view-tab ${view === 'workload' ? 'active' : ''}`}
            onClick={() => setView('workload')}
          >
            Workload
          </button>
        </div>
      </div>

      {/* Plan Card */}
      {plan && (
        <section className="dev-plan-card">
          <div className="plan-card-header">
            <div className="plan-title-box">
              <SparklesIcon size={16} />
              <strong>Adaptive Daily Execution Plan</strong>
              <span className="plan-source-badge">
                {plan.source === 'claude' ? 'Powered by Claude' : 'Smart Heuristics'}
              </span>
            </div>
            <button
              className="plan-close-btn"
              onClick={() => setPlan(null)}
              aria-label="Dismiss plan"
            >
              ✕
            </button>
          </div>
          <p className="plan-summary-text">{plan.summary}</p>
          <ol className="plan-order-list">
            {plan.order.map((o) => (
              <li key={o.id} className="plan-order-item">
                <button className="plan-task-link" onClick={() => openById(o.id)}>
                  {o.title || 'Task'}
                </button>
                <span className="plan-reason"> — {o.reason}</span>
              </li>
            ))}
          </ol>
          {plan.tips?.length > 0 && (
            <ul className="plan-tips-list">
              {plan.tips.map((t, i) => (
                <li key={i} className="plan-tip-item">
                  💡 {t}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {error && <pre className="dev-error-banner" role="alert">{error}</pre>}

      {/* Main Task Canvas */}
      {loading ? (
        <div className="dev-loading-state">
          <div className="spinner-mini" />
          <p className="muted">Syncing workspace items…</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="dev-empty-state">
          <div className="empty-sparkle-ring">
            <SparklesIcon size={32} />
          </div>
          <h3>No tasks match your workspace filters</h3>
          <p className="muted">
            Type in the command bar above or click <b>+ Manual</b> to add your first item.
          </p>
        </div>
      ) : view === 'list' ? (
        <div className="dev-task-list">{tasks.map(card)}</div>
      ) : view === 'board' ? (
        <div className="dev-kanban-board">
          {STATUSES.map((s) => {
            const col = tasks.filter((t) => t.status === s.id);
            return (
              <section className="kanban-column" key={s.id}>
                <div className="kanban-column-head">
                  <h4>{s.label}</h4>
                  <span className="kanban-counter">{col.length}</span>
                </div>
                <div className="kanban-column-cards">
                  {col.map(card)}
                  {!col.length && (
                    <div className="kanban-empty-slot">
                      <span>No tasks in this lane</span>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : view === 'matrix' ? (
        <MatrixView tasks={tasks} renderCard={card} />
      ) : (
        <WorkloadView tasks={tasks} renderCard={card} />
      )}

      {doneCount > 0 && (
        <div className="clear-done-footer">
          <button className="clear-done-btn" onClick={clearDone}>
            Archive {doneCount} completed task{doneCount === 1 ? '' : 's'}
          </button>
        </div>
      )}

      {/* Mobile Floating Action Button */}
      <button
        className="dev-fab"
        onClick={() => setModal({ task: {} })}
        aria-label="New task"
      >
        ＋
      </button>

      {modal && (
        <TaskModal
          key={modal.task._id || 'new'}
          task={modal.task}
          availableTasks={tasks}
          aiSource={modal.aiSource}
          onSave={saveTask}
          onDelete={removeTask}
          onClose={() => setModal(null)}
        />
      )}

      {standupOpen && <StandupModal onClose={() => setStandupOpen(false)} />}

      {execOpen && <ExecutiveReportModal onClose={() => setExecOpen(false)} />}

      {toast && <div className="dev-toast" role="status">{toast}</div>}
    </main>
  );
}
