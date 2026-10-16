const router = require('express').Router();
const mongoose = require('mongoose');
const { z } = require('zod');
const Task = require('../models/Task');
const { asyncHandler, validate, validateObjectId, HttpError } = require('../middleware/helpers');

const MAX_TASKS_PER_USER = 5000;
const STATUS = ['todo', 'in_progress', 'done'];
const PRIORITY = ['low', 'medium', 'high', 'urgent'];

const subtaskInput = z.object({
  _id: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  title: z.string().trim().min(1).max(200),
  done: z.boolean().default(false),
});

const taskInput = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(5000).default(''),
  project: z.string().trim().max(60).default(''),
  assignee: z.string().trim().max(60).default(''),
  status: z.enum(STATUS).default('todo'),
  priority: z.enum(PRIORITY).default('medium'),
  dueDate: z.coerce.date().nullable().default(null),
  tags: z
    .array(z.string().trim().toLowerCase().min(1).max(30))
    .max(10)
    .default([])
    .transform((t) => [...new Set(t)]),
  subtasks: z.array(subtaskInput).max(30).default([]),
  acceptanceCriteria: z.array(z.string().trim().max(300)).max(20).default([]),
  dependencies: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).default([]),
  estimateMinutes: z.number().int().min(0).max(100000).nullable().default(null),
  loggedMinutes: z.number().int().min(0).max(100000).default(0),
});
const taskUpdate = taskInput.partial();

const validTz = (tz) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const listQuery = z.object({
  status: z.enum(STATUS).optional(),
  priority: z.enum(PRIORITY).optional(),
  project: z.string().trim().max(60).optional(),
  assignee: z.string().trim().max(60).optional(),
  tag: z.string().trim().toLowerCase().max(30).optional(),
  q: z.string().trim().max(100).optional(),
  dueFrom: z.coerce.date().optional(),
  dueTo: z.coerce.date().optional(),
  overdue: z.enum(['true']).optional(),
  noDue: z.enum(['true']).optional(),
  hasBlockers: z.enum(['true']).optional(),
  sort: z.enum(['createdAt', 'updatedAt', 'dueDate', 'priority', 'title', 'estimateMinutes', 'loggedMinutes']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

const statsQuery = z.object({
  tz: z.string().max(64).refine(validTz, 'Invalid timezone').default('UTC'),
  dayStart: z.coerce.date().optional(),
  dayEnd: z.coerce.date().optional(),
});

const commentInput = z.object({
  author: z.string().trim().max(60).default('Team Member'),
  text: z.string().trim().min(1, 'Comment text is required').max(2000),
});

const logTimeInput = z.object({
  minutes: z.number().int().min(1).max(1440),
  note: z.string().trim().max(200).default(''),
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get(
  '/',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const f = req.query;
    const filter = { user: req.userId };
    if (f.status) filter.status = f.status;
    if (f.priority) filter.priority = f.priority;
    if (f.project) filter.project = f.project;
    if (f.assignee) filter.assignee = f.assignee;
    if (f.tag) filter.tags = f.tag;
    if (f.hasBlockers) filter['dependencies.0'] = { $exists: true };
    if (f.q) {
      const rx = new RegExp(escapeRegex(f.q), 'i');
      filter.$or = [{ title: rx }, { description: rx }, { tags: rx }, { project: rx }, { assignee: rx }];
    }
    if (f.overdue) {
      filter.status = { $ne: 'done' };
      filter.dueDate = { $lt: new Date() };
    } else if (f.noDue) {
      filter.dueDate = null;
    } else if (f.dueFrom || f.dueTo) {
      filter.dueDate = {};
      if (f.dueFrom) filter.dueDate.$gte = f.dueFrom;
      if (f.dueTo) filter.dueDate.$lte = f.dueTo;
    }

    const dir = f.order === 'asc' ? 1 : -1;
    const sortField = f.sort === 'priority' ? 'priorityRank' : f.sort;
    const sort = { [sortField]: dir, _id: -1 };

    const [items, total] = await Promise.all([
      Task.find(filter)
        .populate('dependencies', 'title status dueDate')
        .sort(sort)
        .skip((f.page - 1) * f.limit)
        .limit(f.limit),
      Task.countDocuments(filter),
    ]);
    res.json({ items, total, page: f.page, pages: Math.ceil(total / f.limit) });
  })
);

router.get(
  '/stats',
  validate(statsQuery, 'query'),
  asyncHandler(async (req, res) => {
    const uid = new mongoose.Types.ObjectId(req.userId);
    const { tz } = req.query;
    const now = new Date();
    const dayStart = req.query.dayStart || new Date(new Date().setUTCHours(0, 0, 0, 0));
    const dayEnd = req.query.dayEnd || new Date(dayStart.getTime() + 24 * 3600 * 1000 - 1);
    const since = new Date(Date.now() - 8 * 24 * 3600 * 1000);

    const [byStatus, byPriority, overdue, dueToday, daily, workload, projects, timeStats] = await Promise.all([
      Task.aggregate([{ $match: { user: uid } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      Task.aggregate([
        { $match: { user: uid, status: { $ne: 'done' } } },
        { $group: { _id: '$priority', n: { $sum: 1 } } },
      ]),
      Task.countDocuments({ user: uid, status: { $ne: 'done' }, dueDate: { $lt: now } }),
      Task.countDocuments({ user: uid, status: { $ne: 'done' }, dueDate: { $gte: dayStart, $lte: dayEnd } }),
      Task.aggregate([
        { $match: { user: uid, completedAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt', timezone: tz } }, n: { $sum: 1 } } },
      ]),
      Task.aggregate([
        { $match: { user: uid, status: { $ne: 'done' } } },
        {
          $group: {
            _id: { $ifNull: ['$assignee', 'Unassigned'] },
            count: { $sum: 1 },
            estMinutes: { $sum: { $ifNull: ['$estimateMinutes', 0] } },
            loggedMinutes: { $sum: { $ifNull: ['$loggedMinutes', 0] } },
          },
        },
      ]),
      Task.distinct('project', { user: uid, project: { $ne: '' } }),
      Task.aggregate([
        { $match: { user: uid } },
        {
          $group: {
            _id: null,
            totalEst: { $sum: { $ifNull: ['$estimateMinutes', 0] } },
            totalLogged: { $sum: { $ifNull: ['$loggedMinutes', 0] } },
          },
        },
      ]),
    ]);

    const status = { todo: 0, in_progress: 0, done: 0 };
    byStatus.forEach((r) => (status[r._id] = r.n));
    const priority = { low: 0, medium: 0, high: 0, urgent: 0 };
    byPriority.forEach((r) => (priority[r._id] = r.n));
    const total = status.todo + status.in_progress + status.done;

    const workloadMap = {};
    workload.forEach((w) => {
      const name = w._id || 'Unassigned';
      workloadMap[name] = {
        count: w.count,
        estimateHours: Math.round((w.estMinutes / 60) * 10) / 10,
        loggedHours: Math.round((w.loggedMinutes / 60) * 10) / 10,
      };
    });

    const totalEst = timeStats[0]?.totalEst || 0;
    const totalLogged = timeStats[0]?.totalLogged || 0;

    res.json({
      total,
      status,
      openByPriority: priority,
      overdue,
      dueToday,
      completionRate: total ? Math.round((status.done / total) * 100) : 0,
      completedByDay: Object.fromEntries(daily.map((d) => [d._id, d.n])),
      workload: workloadMap,
      projects: projects.filter(Boolean),
      totalEstimateHours: Math.round((totalEst / 60) * 10) / 10,
      totalLoggedHours: Math.round((totalLogged / 60) * 10) / 10,
    });
  })
);

router.delete(
  '/completed',
  asyncHandler(async (req, res) => {
    const r = await Task.deleteMany({ user: req.userId, status: 'done' });
    res.json({ deleted: r.deletedCount });
  })
);

router.post(
  '/',
  validate(taskInput),
  asyncHandler(async (req, res) => {
    if ((await Task.countDocuments({ user: req.userId })) >= MAX_TASKS_PER_USER) {
      throw new HttpError(403, 'Task limit reached');
    }
    const task = await Task.create({
      ...req.body,
      user: req.userId,
      activityLog: [{ action: 'Created task', detail: `Initial status: ${req.body.status || 'todo'}` }],
    });
    res.status(201).json({ task });
  })
);

router.get(
  '/:id',
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const task = await Task.findOne({ _id: req.params.id, user: req.userId }).populate(
      'dependencies',
      'title status dueDate'
    );
    if (!task) throw new HttpError(404, 'Task not found');
    res.json({ task });
  })
);

router.patch(
  '/:id',
  validateObjectId('id'),
  validate(taskUpdate),
  asyncHandler(async (req, res) => {
    const task = await Task.findOne({ _id: req.params.id, user: req.userId });
    if (!task) throw new HttpError(404, 'Task not found');

    // Audit trail detection
    const updates = [];
    if (req.body.status && req.body.status !== task.status) {
      updates.push({ action: 'Status changed', detail: `${task.status} → ${req.body.status}` });
    }
    if (req.body.priority && req.body.priority !== task.priority) {
      updates.push({ action: 'Priority changed', detail: `${task.priority} → ${req.body.priority}` });
    }
    if (req.body.assignee !== undefined && req.body.assignee !== task.assignee) {
      updates.push({ action: 'Assignee changed', detail: `${task.assignee || 'None'} → ${req.body.assignee || 'Unassigned'}` });
    }
    if (req.body.project !== undefined && req.body.project !== task.project) {
      updates.push({ action: 'Project changed', detail: `${task.project || 'None'} → ${req.body.project || 'None'}` });
    }
    if (req.body.dueDate !== undefined) {
      const oldDue = task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : 'None';
      const newDue = req.body.dueDate ? new Date(req.body.dueDate).toISOString().slice(0, 10) : 'None';
      if (oldDue !== newDue) updates.push({ action: 'Due date changed', detail: `${oldDue} → ${newDue}` });
    }

    if (updates.length > 0) {
      task.activityLog.push(...updates);
    }

    // Only whitelisted, validated fields are ever assigned (no mass-assignment of user/_id).
    for (const key of Object.keys(req.body)) task[key] = req.body[key];
    await task.save();
    res.json({ task });
  })
);

router.post(
  '/:id/comments',
  validateObjectId('id'),
  validate(commentInput),
  asyncHandler(async (req, res) => {
    const task = await Task.findOne({ _id: req.params.id, user: req.userId });
    if (!task) throw new HttpError(404, 'Task not found');

    const comment = { author: req.body.author, text: req.body.text, createdAt: new Date() };
    task.comments.push(comment);
    task.activityLog.push({ action: 'Comment added', detail: `By ${comment.author}` });
    await task.save();
    res.status(201).json({ comments: task.comments });
  })
);

router.post(
  '/:id/log-time',
  validateObjectId('id'),
  validate(logTimeInput),
  asyncHandler(async (req, res) => {
    const task = await Task.findOne({ _id: req.params.id, user: req.userId });
    if (!task) throw new HttpError(404, 'Task not found');

    task.loggedMinutes = (task.loggedMinutes || 0) + req.body.minutes;
    task.activityLog.push({
      action: 'Time logged',
      detail: `+${req.body.minutes} min${req.body.note ? ` (${req.body.note})` : ''} (Total: ${task.loggedMinutes} min)`,
    });
    await task.save();
    res.json({ loggedMinutes: task.loggedMinutes, activityLog: task.activityLog });
  })
);

router.delete(
  '/:id',
  validateObjectId('id'),
  asyncHandler(async (req, res) => {
    const r = await Task.deleteOne({ _id: req.params.id, user: req.userId });
    if (!r.deletedCount) throw new HttpError(404, 'Task not found');
    res.json({ ok: true });
  })
);

module.exports = router;
