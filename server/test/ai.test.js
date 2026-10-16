const test = require('node:test');
const assert = require('node:assert');
const {
  heuristicParse,
  heuristicBreakdown,
  heuristicPlan,
  heuristicRefine,
  heuristicStandup,
  heuristicExecutiveSummary,
} = require('../src/services/ai');

// Fixed "now": Sat 17 Oct 2026 10:00 local, user in IST (getTimezoneOffset() = -330)
const TZ = -330;
const NOW = new Date(Date.UTC(2026, 9, 17, 10, 0) + TZ * 60000);
const local = (d) => new Date(d.getTime() - TZ * 60000).toISOString().slice(0, 16);

test('parses date, time, priority and tags', () => {
  const r = heuristicParse('Submit report tomorrow at 5pm high priority #work', NOW, TZ);
  assert.strictEqual(r.title, 'Submit report');
  assert.strictEqual(r.priority, 'high');
  assert.deepStrictEqual(r.tags, ['work']);
  assert.strictEqual(local(r.dueDate), '2026-10-18T17:00');
});

test('weekday resolves to the next occurrence', () => {
  const r = heuristicParse('Call mom on friday', NOW, TZ);
  assert.strictEqual(local(r.dueDate).slice(0, 10), '2026-10-23');
  assert.strictEqual(r.title, 'Call mom');
});

test('estimate and urgent', () => {
  const r = heuristicParse('urgent fix login bug today for 2 hours', NOW, TZ);
  assert.strictEqual(r.priority, 'urgent');
  assert.strictEqual(r.estimateMinutes, 120);
});

test('plain text keeps defaults', () => {
  const r = heuristicParse('Buy milk', NOW, TZ);
  assert.strictEqual(r.title, 'Buy milk');
  assert.strictEqual(r.dueDate, null);
  assert.strictEqual(r.priority, 'medium');
});

test('breakdown and plan fallbacks', () => {
  assert.ok(heuristicBreakdown('Write essay').subtasks.length >= 3);
  const plan = heuristicPlan(
    [
      { id: 'a', priority: 'low', status: 'todo', dueDate: null },
      { id: 'b', priority: 'high', status: 'todo', dueDate: new Date(NOW.getTime() - 3600e3) },
    ],
    NOW
  );
  assert.strictEqual(plan.order[0].id, 'b');
});

test('enterprise AI: ticket refine generates user story and acceptance criteria', () => {
  const feat = heuristicRefine('Implement Single Sign-On with SAML', 'Need SSO for enterprise clients');
  assert.ok(feat.userStory.includes('As a'));
  assert.ok(feat.acceptanceCriteria.length >= 3);
  assert.ok(feat.subtasks.length >= 3);
  assert.strictEqual(feat.suggestedPriority, 'medium');

  const bug = heuristicRefine('Fix production checkout crash on mobile', 'Null pointer on payment token');
  assert.strictEqual(bug.suggestedPriority, 'high');
  assert.ok(bug.acceptanceCriteria.some((c) => c.toLowerCase().includes('regression') || c.toLowerCase().includes('reproduction')));
  assert.ok(bug.suggestedTags.includes('bug'));
});

test('enterprise AI: daily standup generates Slack-ready structured report', () => {
  const standup = heuristicStandup({
    completedTasks: [{ title: 'Refactor Auth API', project: 'Backend' }],
    inProgressTasks: [{ title: 'Build Billing Webhooks', priority: 'urgent' }],
    blockedTasks: [{ title: 'Deploy DB Migration' }],
  });
  assert.ok(standup.yesterday[0].includes('Refactor Auth API'));
  assert.ok(standup.today[0].includes('Build Billing Webhooks'));
  assert.ok(standup.blockers[0].includes('Deploy DB Migration'));
  assert.ok(standup.slackFormatted.includes('Daily Standup Update'));
});

test('enterprise AI: executive summary evaluates sprint health and risk radar', () => {
  const healthy = heuristicExecutiveSummary([
    { title: 'T1', status: 'done', priority: 'medium' },
    { title: 'T2', status: 'done', priority: 'low' },
    { title: 'T3', status: 'in_progress', priority: 'medium' },
  ]);
  assert.strictEqual(healthy.sprintHealth, 'On Track');
  assert.ok(healthy.completionPercentage >= 60);

  const atRisk = heuristicExecutiveSummary([
    { title: 'T1', status: 'in_progress', dueDate: new Date(Date.now() - 864e5), dependencies: ['x'] },
    { title: 'T2', status: 'todo', dueDate: new Date(Date.now() - 864e5), dependencies: ['y'] },
    { title: 'T3', status: 'todo', dueDate: new Date(Date.now() - 864e5), dependencies: ['z'] },
  ]);
  assert.strictEqual(atRisk.sprintHealth, 'Critical Attention Needed');
  assert.ok(atRisk.riskRadar.length > 0);
  assert.ok(atRisk.riskRadar.some((r) => r.severity === 'high' || r.severity === 'medium'));
});

