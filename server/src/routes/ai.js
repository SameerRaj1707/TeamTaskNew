const router = require('express').Router();
const { z } = require('zod');
const Task = require('../models/Task');
const { asyncHandler, validate } = require('../middleware/helpers');
const ai = require('../services/ai');

const clientTime = {
  now: z.coerce.date().optional(),
  tzOffset: z.number().int().min(-840).max(840).default(0),
};

const parseBody = z.object({ text: z.string().trim().min(2).max(500), ...clientTime });
const breakdownBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(''),
});
const planBody = z.object(clientTime);

// Trust the client's clock only if it is within a day of the server's.
const safeNow = (d) => (d && Math.abs(d.getTime() - Date.now()) < 864e5 ? d : new Date());

router.get('/status', (_req, res) => res.json({ provider: process.env.ANTHROPIC_API_KEY ? 'claude' : 'fallback' }));

router.post(
  '/parse',
  validate(parseBody),
  asyncHandler(async (req, res) => {
    const { text, now, tzOffset } = req.body;
    res.json(await ai.parseTask(text, safeNow(now), tzOffset));
  })
);

router.post(
  '/breakdown',
  validate(breakdownBody),
  asyncHandler(async (req, res) => {
    res.json(await ai.breakdownTask(req.body.title, req.body.description));
  })
);

router.post(
  '/plan',
  validate(planBody),
  asyncHandler(async (req, res) => {
    const { now, tzOffset } = req.body;
    const docs = await Task.find({ user: req.userId, status: { $ne: 'done' } })
      .sort({ priorityRank: -1, dueDate: 1 })
      .limit(50);
    const tasks = docs.map((d) => ({
      id: String(d._id),
      title: d.title,
      status: d.status,
      priority: d.priority,
      dueDate: d.dueDate,
      estimateMinutes: d.estimateMinutes,
      subtasks: d.subtasks,
    }));
    const plan = await ai.planDay(tasks, safeNow(now), tzOffset);
    // attach titles so the client can render without another lookup
    const byId = new Map(tasks.map((t) => [t.id, t]));
    plan.order = plan.order.map((o) => ({ ...o, title: byId.get(o.id)?.title || '' }));
    res.json(plan);
  })
);

const refineBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(3000).default(''),
});

router.post(
  '/refine',
  validate(refineBody),
  asyncHandler(async (req, res) => {
    res.json(await ai.refineTask(req.body.title, req.body.description));
  })
);

router.post(
  '/standup',
  validate(planBody),
  asyncHandler(async (req, res) => {
    const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000);
    const [completedDocs, openDocs] = await Promise.all([
      Task.find({ user: req.userId, status: 'done', updatedAt: { $gte: twoDaysAgo } })
        .sort({ updatedAt: -1 })
        .limit(10),
      Task.find({ user: req.userId, status: { $ne: 'done' } })
        .sort({ priorityRank: -1, dueDate: 1 })
        .limit(50),
    ]);

    const completedTasks = completedDocs.map((d) => ({
      title: d.title,
      project: d.project,
      assignee: d.assignee,
      loggedMinutes: d.loggedMinutes,
    }));

    const inProgressTasks = openDocs
      .filter((d) => d.status === 'in_progress')
      .map((d) => ({ title: d.title, priority: d.priority, project: d.project }));

    const now = new Date();
    const blockedTasks = openDocs
      .filter((d) => (d.dependencies && d.dependencies.length > 0) || (d.dueDate && d.dueDate < now))
      .map((d) => ({ title: d.title, priority: d.priority, project: d.project }));

    const openTasks = openDocs.map((d) => ({ title: d.title, priority: d.priority, project: d.project }));

    const standup = await ai.generateStandup({ completedTasks, inProgressTasks, blockedTasks, openTasks });
    res.json(standup);
  })
);

router.post(
  '/executive-summary',
  validate(planBody),
  asyncHandler(async (req, res) => {
    const docs = await Task.find({ user: req.userId }).sort({ updatedAt: -1 }).limit(100);
    const tasks = docs.map((d) => ({
      id: String(d._id),
      title: d.title,
      status: d.status,
      priority: d.priority,
      project: d.project,
      assignee: d.assignee,
      dueDate: d.dueDate,
      estimateMinutes: d.estimateMinutes,
      loggedMinutes: d.loggedMinutes,
      dependencies: d.dependencies,
    }));

    const summary = await ai.generateExecutiveSummary(tasks);
    res.json(summary);
  })
);

module.exports = router;

