import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { PRIORITIES, STATUSES, errMsg, fromInputValue, toInputValue } from '../utils.js';

export default function TaskModal({ task, availableTasks = [], aiSource, onSave, onDelete, onClose }) {
  const isNew = !task._id;
  const [tab, setTab] = useState('spec'); // 'spec' | 'activity'
  const [f, setF] = useState(() => ({
    title: task.title || '',
    description: task.description || '',
    project: task.project || '',
    assignee: task.assignee || '',
    status: task.status || 'todo',
    priority: task.priority || 'medium',
    due: toInputValue(task.dueDate),
    estimate: task.estimateMinutes ?? '',
    logged: task.loggedMinutes ?? 0,
    tags: (task.tags || []).join(', '),
    dependencies: (task.dependencies || []).map((d) => (typeof d === 'object' ? d._id : d)),
    acceptanceCriteria: task.acceptanceCriteria ? [...task.acceptanceCriteria] : [],
    subtasks: (task.subtasks || []).map((s) => ({ ...s })),
  }));

  const [newSub, setNewSub] = useState('');
  const [newAc, setNewAc] = useState('');
  const [newComment, setNewComment] = useState('');
  const [commentAuthor, setCommentAuthor] = useState('');
  const [comments, setComments] = useState(task.comments || []);
  const [activityLog] = useState(task.activityLog || []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [refineBusy, setRefineBusy] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  const titleRef = useRef(null);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (isNew) titleRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [isNew]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const addSub = () => {
    const t = newSub.trim();
    if (!t) return;
    setF((x) => ({ ...x, subtasks: [...x.subtasks, { title: t.slice(0, 200), done: false }] }));
    setNewSub('');
  };

  const addAc = () => {
    const t = newAc.trim();
    if (!t) return;
    setF((x) => ({ ...x, acceptanceCriteria: [...x.acceptanceCriteria, t.slice(0, 300)] }));
    setNewAc('');
  };

  const removeAc = (idx) => {
    setF((x) => ({ ...x, acceptanceCriteria: x.acceptanceCriteria.filter((_, i) => i !== idx) }));
  };

  const toggleDependency = (depId) => {
    setF((x) => {
      const exists = x.dependencies.includes(depId);
      return {
        ...x,
        dependencies: exists ? x.dependencies.filter((id) => id !== depId) : [...x.dependencies, depId],
      };
    });
  };

  const breakdown = async () => {
    if (!f.title.trim()) return setError('Enter a title first so the AI knows what to break down.');
    setError('');
    setAiBusy(true);
    try {
      const r = await api.post('/ai/breakdown', { title: f.title.trim(), description: f.description });
      setF((x) => ({
        ...x,
        subtasks: [...x.subtasks, ...r.subtasks.map((t) => ({ title: t, done: false }))].slice(0, 30),
        estimate: x.estimate === '' && r.estimateMinutes ? r.estimateMinutes : x.estimate,
      }));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setAiBusy(false);
    }
  };

  const refineWithAi = async () => {
    if (!f.title.trim()) return setError('Enter a title or issue summary first.');
    setError('');
    setRefineBusy(true);
    try {
      const r = await api.post('/ai/refine', { title: f.title.trim(), description: f.description });
      setF((x) => {
        const mergedTags = [...new Set([...(x.tags ? x.tags.split(',').map((s) => s.trim()) : []), ...(r.suggestedTags || [])])].filter(Boolean);
        const newDesc = r.userStory
          ? `### User Story\n${r.userStory}\n\n### Technical & Implementation Notes\n${(r.technicalNotes || []).map((n) => `• ${n}`).join('\n')}\n\n${x.description ? `### Original Notes\n${x.description}` : ''}`
          : x.description;

        return {
          ...x,
          title: r.refinedTitle || x.title,
          description: newDesc.trim(),
          priority: r.suggestedPriority || x.priority,
          estimate: x.estimate === '' && r.estimateMinutes ? r.estimateMinutes : x.estimate,
          tags: mergedTags.join(', '),
          acceptanceCriteria: [...new Set([...x.acceptanceCriteria, ...(r.acceptanceCriteria || [])])].slice(0, 20),
          subtasks: [
            ...x.subtasks,
            ...(r.subtasks || []).map((t) => ({ title: t, done: false })),
          ].slice(0, 30),
        };
      });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setRefineBusy(false);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !task._id) return;
    setCommentBusy(true);
    try {
      const author = commentAuthor.trim() || 'Team Member';
      const res = await api.post(`/tasks/${task._id}/comments`, { author, text: newComment.trim() });
      setComments(res.comments);
      setNewComment('');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setCommentBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSave({
        title: f.title,
        description: f.description,
        project: f.project.trim(),
        assignee: f.assignee.trim(),
        status: f.status,
        priority: f.priority,
        dueDate: fromInputValue(f.due),
        estimateMinutes: f.estimate === '' ? null : Math.max(0, Math.round(Number(f.estimate))),
        loggedMinutes: f.logged === '' ? 0 : Math.max(0, Math.round(Number(f.logged))),
        dependencies: f.dependencies,
        acceptanceCriteria: f.acceptanceCriteria.filter(Boolean),
        tags: f.tags
          .split(',')
          .map((t) => t.trim().replace(/^#/, ''))
          .filter(Boolean)
          .slice(0, 10),
        subtasks: f.subtasks.map((s) => ({
          ...(s._id ? { _id: s._id } : {}),
          title: s.title,
          done: !!s.done,
        })),
      });
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  };

  // Candidates for dependencies (exclude this task itself)
  const candidateDependencies = availableTasks.filter((t) => t._id && t._id !== task._id);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="sheet enterprise-task-modal"
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? 'New task' : 'Edit task'}
      >
        <div className="sheet-head">
          <div className="modal-title-wrap">
            <h2>{isNew ? 'Create Enterprise Task' : 'Task Specification & Workspace'}</h2>
            <div className="seg small modal-tabs">
              <button
                type="button"
                className={tab === 'spec' ? 'on' : ''}
                onClick={() => setTab('spec')}
              >
                Specification & Plan
              </button>
              {!isNew && (
                <button
                  type="button"
                  className={tab === 'activity' ? 'on' : ''}
                  onClick={() => setTab('activity')}
                >
                  Activity & Audit ({comments.length + activityLog.length})
                </button>
              )}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {aiSource && (
          <p className="hint ai-note">
            ✨ Pre-filled by {aiSource === 'claude' ? 'Claude' : 'smart rules'} — refine and save.
          </p>
        )}

        {tab === 'spec' ? (
          <>
            <div className="ai-refine-banner">
              <div className="ai-banner-text">
                <strong>✨ AI Requirement Refiner</strong>
                <span>Transforms vague notes into structured user stories, acceptance criteria & subtasks.</span>
              </div>
              <button
                type="button"
                className="btn primary small"
                onClick={refineWithAi}
                disabled={refineBusy || !f.title.trim()}
              >
                {refineBusy ? 'Refining Spec…' : '✨ Refine & Generate Spec'}
              </button>
            </div>

            <label>
              Title
              <input
                ref={titleRef}
                value={f.title}
                onChange={set('title')}
                maxLength={200}
                required
                placeholder="e.g. Implement OAuth2 Refresh Token Rotation"
              />
            </label>

            <div className="grid2">
              <label>
                Project / Epic
                <input
                  value={f.project}
                  onChange={set('project')}
                  maxLength={60}
                  placeholder="e.g. Core Auth, Mobile, Q4 Marketing"
                />
              </label>
              <label>
                Assignee
                <input
                  value={f.assignee}
                  onChange={set('assignee')}
                  maxLength={60}
                  placeholder="e.g. Alex, Sarah, DevOps Team"
                />
              </label>
            </div>

            <label>
              Specification / User Story / Notes
              <textarea
                value={f.description}
                onChange={set('description')}
                rows={4}
                maxLength={5000}
                placeholder="Context, problem definition, acceptance requirements or technical notes"
              />
            </label>

            <div className="grid4">
              <label>
                Status
                <select value={f.status} onChange={set('status')}>
                  {STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select value={f.priority} onChange={set('priority')}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Due Date & Time
                <input type="datetime-local" value={f.due} onChange={set('due')} />
              </label>
              <label>
                Estimate (min)
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="100000"
                  value={f.estimate}
                  onChange={set('estimate')}
                />
              </label>
            </div>

            <div className="grid2">
              <label>
                Logged Time (min)
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="100000"
                  value={f.logged}
                  onChange={set('logged')}
                />
              </label>
              <label>
                Tags <span className="muted">(comma separated)</span>
                <input value={f.tags} onChange={set('tags')} placeholder="security, backend, high-roi" />
              </label>
            </div>

            {/* Acceptance Criteria */}
            <div className="ac-section">
              <div className="subs-head">
                <strong>📋 Acceptance Criteria (Definition of Done)</strong>
                <span className="muted small-t">{f.acceptanceCriteria.length} items</span>
              </div>
              {f.acceptanceCriteria.map((ac, i) => (
                <div className="ac-row" key={i}>
                  <span className="bullet">✓</span>
                  <span className="ac-text">{ac}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Remove criterion"
                    onClick={() => removeAc(i)}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <div className="sub-row">
                <input
                  className="sub-title"
                  value={newAc}
                  onChange={(e) => setNewAc(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addAc();
                    }
                  }}
                  placeholder="Add acceptance criterion (e.g. System returns 401 when token is expired)"
                  maxLength={300}
                />
                <button type="button" className="btn ghost small" onClick={addAc}>
                  Add AC
                </button>
              </div>
            </div>

            {/* Dependencies */}
            {candidateDependencies.length > 0 && (
              <div className="dependencies-section">
                <strong>⛔ Blocked By (Prerequisite Tasks)</strong>
                <p className="hint">Select tasks that must be completed before this task can start:</p>
                <div className="dep-list">
                  {candidateDependencies.map((cand) => {
                    const isSelected = f.dependencies.includes(cand._id);
                    return (
                      <label key={cand._id} className={`dep-item ${isSelected ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleDependency(cand._id)}
                        />
                        <span className="dep-title">{cand.title}</span>
                        <span className={`chip p-${cand.priority}`}>{cand.priority}</span>
                        <span className="chip">{cand.status}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Subtasks */}
            <div className="subs">
              <div className="subs-head">
                <strong>Subtasks</strong>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={breakdown}
                  disabled={aiBusy}
                >
                  {aiBusy ? 'Thinking…' : '✨ Break down with AI'}
                </button>
              </div>
              {f.subtasks.map((s, i) => (
                <div className="sub-row" key={s._id || `n${i}`}>
                  <input
                    type="checkbox"
                    checked={!!s.done}
                    onChange={(e) =>
                      setF((x) => ({
                        ...x,
                        subtasks: x.subtasks.map((y, j) =>
                          j === i ? { ...y, done: e.target.checked } : y
                        ),
                      }))
                    }
                    aria-label={`Done: ${s.title}`}
                  />
                  <input
                    className="sub-title"
                    value={s.title}
                    maxLength={200}
                    onChange={(e) =>
                      setF((x) => ({
                        ...x,
                        subtasks: x.subtasks.map((y, j) =>
                          j === i ? { ...y, title: e.target.value } : y
                        ),
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Remove subtask"
                    onClick={() =>
                      setF((x) => ({ ...x, subtasks: x.subtasks.filter((_, j) => j !== i) }))
                    }
                  >
                    ✕
                  </button>
                </div>
              ))}
              <div className="sub-row">
                <input
                  className="sub-title"
                  value={newSub}
                  onChange={(e) => setNewSub(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSub();
                    }
                  }}
                  placeholder="Add a subtask and press Enter"
                  maxLength={200}
                />
                <button type="button" className="btn ghost small" onClick={addSub}>
                  Add
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Activity and Comments Tab */
          <div className="activity-tab-content">
            <div className="comments-section">
              <h4>💬 Discussion & Team Comments</h4>
              {comments.length === 0 ? (
                <p className="muted small-t">No comments yet. Start the thread below.</p>
              ) : (
                <div className="comments-stream">
                  {comments.map((c, i) => (
                    <div key={c._id || i} className="comment-bubble">
                      <div className="comment-meta">
                        <strong>{c.author || 'Team Member'}</strong>
                        <span>{new Date(c.createdAt).toLocaleString()}</span>
                      </div>
                      <p>{c.text}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="comment-form">
                <div className="grid2">
                  <input
                    value={commentAuthor}
                    onChange={(e) => setCommentAuthor(e.target.value)}
                    placeholder="Your Name / Handle"
                    maxLength={60}
                  />
                </div>
                <div className="comment-input-row">
                  <input
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Write a comment, link PR or paste issue update…"
                    maxLength={2000}
                  />
                  <button
                    type="button"
                    className="btn primary small"
                    onClick={handleAddComment}
                    disabled={commentBusy || !newComment.trim()}
                  >
                    Post
                  </button>
                </div>
              </div>
            </div>

            <div className="audit-section">
              <h4>🛡️ Activity Log & Audit Trail</h4>
              {activityLog.length === 0 ? (
                <p className="muted small-t">No audit logs recorded.</p>
              ) : (
                <ul className="audit-timeline">
                  {activityLog
                    .slice()
                    .reverse()
                    .map((item, idx) => (
                      <li key={item._id || idx} className="audit-item">
                        <span className="audit-bullet" />
                        <div className="audit-content">
                          <span className="audit-action">{item.action}</span>
                          {item.detail && <span className="audit-detail">{item.detail}</span>}
                          <span className="audit-time">
                            {new Date(item.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {error && <pre className="error" role="alert">{error}</pre>}

        <div className="sheet-foot">
          {!isNew && (
            <button type="button" className="btn danger" onClick={() => onDelete(task)}>
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save Task'}
          </button>
        </div>
      </form>
    </div>
  );
}
