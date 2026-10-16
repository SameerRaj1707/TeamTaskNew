export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
export const STATUSES = [
  { id: 'todo', label: 'To do' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'done', label: 'Done' },
];
export const statusLabel = (id) => STATUSES.find((s) => s.id === id)?.label || id;

export const tzOffset = () => new Date().getTimezoneOffset();
export const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
export const endOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};
export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const pad = (n) => String(n).padStart(2, '0');
export const localDateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// <input type="datetime-local"> <-> ISO string
export const toInputValue = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${localDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromInputValue = (v) => (v ? new Date(v).toISOString() : null);

const timeFmt = { hour: 'numeric', minute: '2-digit' };

export function dueInfo(iso, done) {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString([], timeFmt);
  const sameDay = (a, b) => localDateKey(a) === localDateKey(b);
  let text;
  if (sameDay(d, now)) text = `Today ${time}`;
  else if (sameDay(d, addDays(now, 1))) text = `Tomorrow ${time}`;
  else if (sameDay(d, addDays(now, -1))) text = `Yesterday ${time}`;
  else text = `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`;

  let tone = 'normal';
  if (!done) {
    if (d < now) tone = 'overdue';
    else if (sameDay(d, now)) tone = 'today';
  }
  return { text: tone === 'overdue' ? `Overdue · ${text}` : text, tone };
}

export const errMsg = (e) => (e && (e.details || e.message)) || 'Something went wrong';

export function formatMinutes(min) {
  if (!min || min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function getEisenhowerQuadrant(task) {
  const isUrgentPriority = task.priority === 'urgent' || task.priority === 'high';
  const now = new Date();
  const isDueSoon = task.dueDate && (new Date(task.dueDate) - now <= 2 * 864e5); // within 48h or overdue
  const isUrgent = isDueSoon || task.priority === 'urgent';
  const isImportant = task.priority === 'high' || task.priority === 'urgent';

  if (isUrgent && isImportant) return 'q1'; // Do First
  if (!isUrgent && isImportant) return 'q2'; // Schedule
  if (isUrgent && !isImportant) return 'q3'; // Delegate
  return 'q4'; // Backlog / Eliminate
}

export function exportCsv(tasks) {
  const headers = [
    'Title',
    'Status',
    'Priority',
    'Project',
    'Assignee',
    'Due Date',
    'Estimate (min)',
    'Logged (min)',
    'Tags',
    'Subtasks Done',
    'Total Subtasks',
    'Created At',
  ];

  const escapeCell = (val) => {
    if (val === null || val === undefined) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = tasks.map((t) => {
    const subDone = (t.subtasks || []).filter((s) => s.done).length;
    const subTotal = (t.subtasks || []).length;
    return [
      escapeCell(t.title),
      escapeCell(t.status),
      escapeCell(t.priority),
      escapeCell(t.project || ''),
      escapeCell(t.assignee || ''),
      escapeCell(t.dueDate ? new Date(t.dueDate).toISOString() : ''),
      escapeCell(t.estimateMinutes ?? ''),
      escapeCell(t.loggedMinutes ?? 0),
      escapeCell((t.tags || []).join(', ')),
      escapeCell(subDone),
      escapeCell(subTotal),
      escapeCell(t.createdAt ? new Date(t.createdAt).toISOString() : ''),
    ].join(',');
  });

  const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent([headers.join(','), ...rows].join('\r\n'));
  const link = document.createElement('a');
  link.setAttribute('href', csvContent);
  link.setAttribute('download', `tasks_export_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

