# TaskFlow AI — AI-powered task manager (MERN)

A secure, installable (PWA) task manager that works on phone and laptop, with an AI assistant powered by Claude.

## Enterprise & Real-World Company Solutions

| Company Problem | TaskFlow AI Real-World Solution |
|---|---|
| **Vague Tickets & "Garbage In, Garbage Out"** | **AI Requirement Refiner & Spec Generator**: Automatically expands brief notes into structured Agile User Stories ("As a... I want... so that..."), Acceptance Criteria checklists (Definition of Done), and Technical Edge Cases. |
| **Silent Roadblocks & Cascading Delays** | **Dependency & Blocker Management**: Explicit prerequisite linking (`dependencies`), automated blocker detection (`⛔ Blocked by X`), and risk alerts before release deadlines slip. |
| **Meeting Fatigue & Standup Overhead** | **1-Click AI Daily Standup Generator**: Reads completed, active, and blocked tasks to generate professional 3-bullet standups with a **"Copy to Slack / Teams"** button. |
| **Blind Spots in Leadership & Delivery Risk** | **AI Executive Sprint Health & Risk Radar**: Analyzes sprint velocity, generates risk assessments (On Track / At Risk / Critical), identifies bottlenecks, and provides actionable recommendations with print/PDF export. |
| **Priority Inflation ("Everything is Urgent")** | **Interactive Eisenhower Matrix View**: 4-quadrant visual sorting (Do First, Schedule, Delegate, Backlog) based on objective business impact vs urgency. |
| **Workload Imbalance & Burnout** | **Team Workload & Capacity Radar**: Groups tasks by assignee/team, tracks weekly hours against 40h thresholds, and displays `🚨 Burnout Risk` warnings for over-allocated members. |
| **Estimation Errors & Budget Slippage** | **Live Focus Stopwatch & Time Tracking**: Built-in task timer logs actual minutes worked; variance tracking compares estimated hours vs logged hours. |
| **Loss of Accountability & Context** | **Activity Audit Trail & Threaded Comments**: Automatically records changes to status, priority, due dates, and assignees with timestamps, alongside team collaboration discussion threads. |
| **Stakeholder Reporting Friction** | **RFC-Compliant CSV Export**: 1-click export of the entire sprint or filtered backlog for Excel, Google Sheets, or finance/compliance reporting. |

## Core Features

- **Multi-View Workspace**: Switch seamlessly between **List**, **Kanban Board**, **Eisenhower Matrix**, and **Team Workload** views.
- **AI Suite**:
  - **Quick Add with AI**: Natural language parsing into structured tasks (due date, priority, tags, estimate).
  - **AI Spec Refiner**: User stories & acceptance criteria generator.
  - **AI Task Breakdown**: Turns any complex task into 3–8 concrete subtasks.
  - **AI Daily Standup**: Slack & MS Teams ready updates.
  - **AI Executive Briefing**: Sprint health diagnosis & bottleneck radar.
  - **AI Plan My Day**: Cognitive prioritization of open tasks.
  - *Full fallback engine included*: All AI features function out-of-the-box even without an API key using deterministic smart heuristics.
- **Enterprise Collaboration**: Projects, Assignees, Dependencies, Audit logs, and Comments.
- **Phone + Laptop**: Responsive PWA layout with offline shell support and dark/light themes.

## Security

| Area | What is done |
|---|---|
| Passwords | bcrypt (cost 12), min 8 chars with letter + number, never returned by the API |
| Sessions | 15-min access JWT held **in memory only**; 7-day refresh token in an `httpOnly`, `SameSite=Strict`, `Secure` (prod) cookie scoped to `/api/auth` |
| Refresh rotation | every refresh issues a new token; the server stores only SHA-256 hashes; replaying an old token revokes **all** sessions; multi-device supported; "sign out all devices"; password change signs out everywhere |
| Brute force | per-account lockout (5 fails → 15 min), per-IP rate limits (login/register/refresh/global), stricter per-user limit on AI routes, timing-safe unknown-email handling |
| Injection | `zod` validation on every input, `express-mongo-sanitize`, `hpp`, regex-escaped search, whitelisted sort fields, ObjectId checks |
| Authorization | every task query is scoped to the authenticated user (no IDOR), no mass-assignment of `user`/`_id` |
| Browser | `helmet` with a strict CSP (`script-src 'self'`), no `x-powered-by`, 50 KB body limit, CSRF defence (`SameSite=Strict` + required `X-Requested-With` header on cookie endpoints), CORS allow-list |
| AI | prompts treat user text as data, output is parsed + schema-validated, task ids from the model are checked against the user's own tasks, API key stays on the server |
| Ops | fails to start in production with weak/missing JWT secrets, generic 500 messages, graceful shutdown |

## Run locally

Requirements: Node 18+ and MongoDB (local, Docker `docker run -p 27017:27017 mongo`, or a free Atlas cluster).

```bash
npm run install:all
cp server/.env.example server/.env      # then edit: MONGO_URI + two random JWT secrets
# generate a secret:  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Development (two terminals):

```bash
npm run dev:server    # API on http://localhost:5000
npm run dev:client    # UI on  http://localhost:5173  (proxies /api to the server)
```

Open the Vite "Network" URL on your phone (same Wi-Fi) to test the mobile layout.

Production (single origin, the server also serves the built UI):

```bash
npm run build
NODE_ENV=production npm start           # http://localhost:5000
```

### Enable full AI
Put your key in `server/.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-sonnet-5-5
```
The header badge shows "✨ Claude" when active and "⚙ Basic AI" when using the fallback.

### Deploy
Any Node host works (Render, Railway, Fly, a VPS). Set `NODE_ENV=production`, `MONGO_URI`, the two JWT secrets and optionally `ANTHROPIC_API_KEY`; build command `npm run install:all && npm run build`; start command `npm start`. **Serve over HTTPS** (required for secure cookies, installing the PWA, and real phone use). On your phone, open the URL and choose *Add to Home Screen*.

## API summary

```
POST /api/auth/register | login | refresh | logout | logout-all | change-password     GET /api/auth/me
GET  /api/tasks?status&priority&project&assignee&tag&q&dueFrom&dueTo&overdue&noDue&hasBlockers&sort&order&page&limit
POST /api/tasks      GET|PATCH|DELETE /api/tasks/:id      DELETE /api/tasks/completed
POST /api/tasks/:id/comments       POST /api/tasks/:id/log-time
GET  /api/tasks/stats
POST /api/ai/parse | breakdown | plan | refine | standup | executive-summary     GET /api/ai/status
```

## Tests
`npm test` runs unit tests for the rule-based AI fallback (date/priority/tag parsing, breakdown, planning).

## Project layout
```
server/src  config/ middleware/ models/ routes/ services/ utils/ index.js
client/src  components/ (Auth, Tasks, TaskCard, TaskModal, Stats) api.js utils.js styles.css
client/public  manifest.webmanifest sw.js icon.svg
```

## Ideas to extend
Recurring tasks, reminders/push notifications, drag-and-drop on the board, email verification & password reset, 2FA, shared projects, PNG app icons for older iOS.
