# TaskTornado — IT Management

Role-based IT operations workspace: tasks, tickets, servers, clients, patching
plans, approvals, renewals and settings — behind one sign-in.

**Milestone 1 (this build): Login + role-based access + animated module grid.**

- Next.js 16 (App Router, React 19, TypeScript, Tailwind CSS 4, Framer Motion)
- Supabase Auth + Postgres row-level security (already provisioned)
- Signed, HTTP-only session cookie; roles re-checked on every request
- 22 unit tests covering the permission matrix, the task window and sessions

---

## 1. Roles

Fifteen roles in six groups. The role drives visible modules and allowed actions.

| Group | Roles |
| --- | --- |
| IT | IT Manager, IT Engineer |
| L2 Support | L2 Support Manager, L2 Support Lead, L2 Support Engineer |
| Implementation | Implementation Manager, Implementation Lead, Implementation Engineer |
| Development | Development Manager, Development Lead, Development Engineer |
| Testing | Testing Manager, Testing Lead, Testing Engineer |
| Management | Management |

Tiers: **manager**, **lead**, **engineer**, **executive** (Management).
Engineers are the only tier with a restricted task-creation window.

## 2. Module access matrix

`✓` = capability granted by default. Everything is enforced server-side.

| Module | View | Create | Edit | Approve | Admin |
| --- | --- | --- | --- | --- | --- |
| Dashboards | Everyone | — | — | — | IT Manager, Management |
| Task Management | Everyone | Everyone* | Leadership | — | — |
| Ticket Portal | Everyone | Everyone | Everyone | — | — |
| Servers | IT + managers + leads + management | — | IT | — | IT Manager |
| Clients Master | Everyone | — | IT + leadership | — | — |
| Patching Plans | IT + managers + leads + management | — | IT | Leadership | — |
| Approvals | Everyone | Everyone | — | Leadership | — |
| Renewals Master | Everyone | — | IT + leadership | — | — |
| Settings | Everyone | — | Everyone (own keys) | — | IT Manager, Management |

\* **Task creation window** — engineers may only raise new tasks between **09:00 and
18:00 IST**; leads, managers, IT and management can raise tasks 24 hours a day.
The window is checked in the server action (`assertCanCreateTask`) against the
server clock, never the browser. Boundary tests live in `tests/task-window.test.ts`.

The registry lives in [`lib/modules.ts`](lib/modules.ts) and [`lib/roles.ts`](lib/roles.ts);
edit those two files to change policy. `lib/access.ts` exposes `can()`,
`canAccessModule()`, `visibleModules()` and `accessMap()`.

## 3. Local development

```bash
npm install
cp .env.example .env.local   # optional: leave Supabase blank for demo mode
npm run dev                  # http://localhost:3000
```

Without Supabase configured the app runs in **demo mode** with fifteen seeded
accounts, one per role, all using the password `Tornado@123`. The login screen
lists them and can sign in with one click. Demo mode is inert as soon as
`NEXT_PUBLIC_SUPABASE_URL` and a publishable/anon key are present.

### Supabase mode

1. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or
   `..._PUBLISHABLE_KEY`) and a strong `AUTH_SECRET`.
2. Apply the RBAC schema — already applied to the `IT_MANAGEMENT` project in
   `supabase/migrations/0001_rbac.sql`.
3. Create employees in Supabase Auth with `raw_user_meta_data` containing
   `role` (one of the fifteen ids) and `full_name`. A trigger creates the
   `profiles` row automatically. Accounts without a role are refused at login.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | TypeScript |
| `npm test` | Policy, window and session tests |

## 4. Security notes

- Session cookie is HMAC-SHA256 signed, HTTP-only, SameSite=Lax, 12-hour TTL.
- Login is throttled to 5 attempts per email + IP per 10 minutes (in-memory).
- Every protected route calls `requireUser()`; module pages call
  `canAccessModule()` again before rendering, and return a 403 panel otherwise.
- Supabase RLS: users read only their own profile; admins (IT Manager,
  Management) can read all profiles; the audit log is insert-self/select-admin.
- Integration keys are masked and never returned to the browser in full.
  Milestone 1 keeps them in process memory; production moves them to Supabase
  Vault (see roadmap).
- Rotate the seeded demo credentials before any production use, and set
  `DISABLE_DEMO_LOGIN=true` once Supabase is configured.

## 5. Project layout

```
app/
  login/                 Sign-in (server action, rate limit, demo switcher)
  (app)/                 Authenticated shell (sidebar, clock, guards)
    modules/dashboard/   Role-aware overview + animated module grid
    modules/[slug]/      All other modules, guarded per role
lib/
  roles.ts               Role catalogue + groups + tiers
  modules.ts             Module registry + capability rules
  access.ts              Policy helpers
  task-window.ts         09:00–18:00 IST enforcement
  auth/                  Session token/cookie, Supabase + demo sign-in
  integrations/store.ts  Per-user Redmine / Action1 key vault (milestone 1)
  tasks/store.ts         Task store (milestone 1)
supabase/migrations/     RBAC schema, RLS, triggers, audit log
tests/                   node:test suites
```

## 6. Roadmap after milestone 1

1. Persist tasks in Postgres (`tasks`, `task_events`) with RLS and wire the board.
2. Redmine sync (assigned tickets, close with comment) using per-user keys.
3. Action1 sync for the server inventory + patching compliance.
4. Clients master, patching plans, approvals, renewals data models and screens.
5. Notification jobs (renewal reminders, approval nudges) and an audit log viewer.
6. Role administration UI for IT Manager backed by `profiles.role`.
