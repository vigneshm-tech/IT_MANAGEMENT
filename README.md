# TaskTornado — IT Management

Role-based IT operations workspace: tasks, tickets, servers, clients, patching
plans, approvals, renewals and settings — behind one sign-in.

**Live:** https://tasktornado.vercel.app
**Repo:** https://github.com/vigneshm-tech/IT_MANAGEMENT

- Next.js 16 (App Router, React 19, TypeScript, Tailwind CSS 4, Framer Motion)
- Supabase Auth + Postgres row-level security (password reset by email)
- Signed, HTTP-only session cookie; roles re-checked on every request
- 24 unit tests covering the permission matrix, the task window and sessions

---

## 1. Design

A light, open canvas — no cards around cards, no gradients, dividers over
containers.

| Token | Value | Use |
| --- | --- | --- |
| `--color-canvas` | `#F5F7FB` | Page background |
| `--color-surface` | `#FFFFFF` | Inputs, dialogs, raised rows |
| `--color-navy` | `#172C52` | Headings, primary text, brand block |
| `--color-navy-soft` | `#2A4470` | Secondary emphasis |
| `--color-gold` | `#C6A96C` | Primary buttons, active nav, focus |
| `--color-body` | `#44536D` | Body copy |
| `--color-muted` | `#7B879C` | Meta, labels |
| `--color-line` | `#E2E7F0` | Dividers and borders |

Tables are built on the [shadcn/ui](https://ui.shadcn.com) `Table` primitives
(`components/ui/table.tsx`, `npx shadcn add …` works via `components.json`),
retuned to the tokens below. Radii stop at 10px. The only motion is a staggered 380ms fade-up on the module
grid and dialog/popover transitions.

**Brand:** the logo is a wordmark, not an icon — the name set in **Audiowide**,
outlined and shipped as fixed vectors (`public/brand/wordmark.svg` and the white
`wordmark-inverse.svg`). The tab icon is the single gold "T" from the same face.

**Navigation:** a 64px top bar with the wordmark flush left and the utilities
flush right — search (⌘K), approval notifications and the account menu. There is
no mega-menu: the Modules launcher (a flat 3/2/1-column canvas with
oversized watermark icons) is the hub and the palette jumps to any page.
Restricted pages never appear in either. Once a module is open, a
one-row breadcrumb under the header shows `Modules / <module>` (and any
nested pages below it).

## 2. Roles

Sixteen roles in seven groups — fifteen public, one hidden. The role drives
visible modules and allowed actions.

| Group | Roles |
| --- | --- |
| IT | IT Manager, IT Engineer |
| L2 Support | L2 Support Manager, L2 Support Lead, L2 Support Engineer |
| Implementation | Implementation Manager, Implementation Lead, Implementation Engineer |
| Development | Development Manager, Development Lead, Development Engineer |
| Testing | Testing Manager, Testing Lead, Testing Engineer |
| Management | Management |
| Platform *(hidden)* | Super Admin — never listed in pickers, reports or the directory |

Tiers: **manager**, **lead**, **engineer**, **executive** (Management, Super Admin).
Engineers are the only tier with a restricted task-creation window.

**Super Admin** is the hidden platform role. It bypasses the access matrix (every
capability, every module) and is the only role that can open **Users**. It is
excluded from `VISIBLE_ROLES`, so it never appears in a task/client/patch owner
picker, the role catalogue or the directory itself — the account that holds it is
filtered out of the Users list too. Provision it by hand in the database; the
sign-up trigger downgrades any request for `super_admin` to "unassigned".

The super admin is also the only account that administers the directory: it adds
employees from **Users → Add user**, suspends or reactivates them, deletes them,
and opens a read-only profile with **View**. Creating an account, changing a
status and deleting all run through `security definer` functions
(`admin_create_user`, `admin_set_user_status`, `admin_delete_user` in
`supabase/migrations/0007_user_administration.sql`) that re-check the caller's
role, refuse the hidden `super_admin` role, and refuse to touch the super admin
account itself. Suspension is enforced on the next request: `requireUser()`
re-reads `profiles.status` and sends a non-active account through `/logout`.

## 3. Module access matrix

`✓` = capability granted by default. Everything is enforced server-side.

| Module | View | Create | Edit | Approve | Admin |
| --- | --- | --- | --- | --- | --- |
| Dashboards | Everyone | — | — | — | IT Manager, Management |
| Task Management | Everyone | Everyone* | Leadership | — | — |
| Ticket Portal | Everyone | Everyone | Everyone | — | — |
| Servers | IT + managers + leads + management | — | IT | — | IT Manager |
| Clients Master | Everyone | Leadership | IT + leadership | — | — |
| Patching Plans | IT + managers + leads + management | IT | IT | Leadership | — |
| Approvals | Everyone | Everyone | — | Leadership | — |
| Renewals Master | Everyone | Leadership | IT + leadership | — | — |
| Settings | Everyone | — | Everyone (own keys) | — | IT Manager, Management |
| Users | Super Admin | Super Admin | Super Admin | — | Super Admin |

\* **Task creation window** — engineers may only raise new tasks between **09:00 and
18:00 IST**; leads, managers, the IT Manager and management can raise tasks 24 hours a day.
The window is checked in the server action (`assertCanCreateTask`) against the
server clock, never the browser. Boundary tests live in `tests/task-window.test.ts`.

The registry lives in [`lib/modules.ts`](lib/modules.ts) and [`lib/roles.ts`](lib/roles.ts);
edit those two files to change policy. `lib/access.ts` exposes `can()`,
`canAccessModule()`, `visibleModules()` and `accessMap()`.

## 4. Data

| Table | Rows in this build | Notes |
| --- | --- | --- |
| `tasks` | 5 seeded + runtime | Teams, priority, due date, status |
| `clients` | 4 seeded | Contact, industry, owner, active flag |
| `patch_plans` | 3 seeded | Window, ring, owner, status |
| `approvals` | 4 seeded | Change/access/patch/purchase, decision trail |
| `renewals` | 4 seeded | Value, currency, notice period, status |

All four record tables (plus `tasks`) have RLS: any authenticated user can read,
rows are inserted as the signed-in user, updates are limited to the creator or
leadership, and approvals can only be decided by leadership. Schemas live in
`supabase/migrations/0001_rbac.sql`, `0002_tasks.sql` and
`0003_business_records.sql`; the hidden role, its directory policy and the first
super-admin account live in `0004_super_admin_role.sql` and
`0005_super_admin_account.sql`; user administration lives in
`0007_user_administration.sql`.

Redmine and Action1 have no sync worker yet: the portal and server inventory
render honest empty states until a key is saved, rather than inventing metrics.

## 5. Local development

```bash
npm install
cp .env.example .env.local   # optional: leave Supabase blank for demo mode
npm run dev                  # http://localhost:3000
```

Without Supabase configured the app runs in **demo mode** with sixteen seeded
accounts, one per role, all using the password `Tornado@123` (the super admin
account is not offered in the role picker). The login screen
can fill any role's credentials from a picker. Demo mode is inert as soon as
`NEXT_PUBLIC_SUPABASE_URL` and a publishable/anon key are present.

### Supabase mode (this is how the deployed build runs)

1. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or
   `..._PUBLISHABLE_KEY`) and a strong `AUTH_SECRET`.
2. Apply the migrations in `supabase/migrations/` in order.
3. Create employees in Supabase Auth with `raw_user_meta_data` containing
   `role` (one of the fifteen public ids) and `full_name`. A trigger creates the
   `profiles` row automatically. Accounts without a role are refused at login.
4. `supabase/seed/demo_employees.sql` documents the fifteen public demo accounts. The
   shared password is **not** committed — it is issued out-of-band and must be
   rotated before production. Public signups are disabled on the project.

### Password reset

`/login/forgot-password` emails a single-use link through Supabase Auth; the link
lands on `/auth/callback`, exchanges the one-time code for a session, and opens
`/login/reset-password` where the new password is set. The request always returns
the same confirmation, so it cannot be used to discover accounts. Delivery uses
the project's SMTP settings — configure a sender in Supabase before relying on it
in production; the built-in mailer is rate-limited.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | TypeScript |
| `npm test` | Policy, window and session tests |

## 6. Security notes

- Session cookie is HMAC-SHA256 signed, HTTP-only, SameSite=Lax, 12-hour TTL.
- Login is throttled to 5 attempts per email + IP per 10 minutes (in-memory).
- Every protected route calls `requireUser()`; module pages call
  `canAccessModule()` again before rendering and show a plain refusal otherwise.
  Supabase sessions are re-checked against `profiles.status` on each request, so
  a suspended or deleted account is signed out instead of waiting for the
  12-hour cookie to expire.
- Supabase RLS: users read only their own profile; admins (IT Manager,
  Management) can read all profiles; the audit log is insert-self/select-admin.
- Integration keys are masked and never returned to the browser in full.
  Milestone 1 keeps them in process memory; production moves them to Supabase
  Vault (see roadmap).
- Rotate the seeded demo credentials before any production use, and set
  `DISABLE_DEMO_LOGIN=true` once Supabase is configured.

### Deployment

The Vercel project `tasktornado` deploys this branch and reads these variables:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (safe to expose) |
| `AUTH_SECRET` | HMAC key for the session cookie |
| `DISABLE_DEMO_LOGIN` | `true` on the deployed project |
| `TASK_WINDOW_TZ`, `TASK_WINDOW_START`, `TASK_WINDOW_END` | Window policy |

## 7. Project layout

```
app/
  login/                 Sign-in (server action, rate limit, role picker) with
                         full-bleed navy background, wordmark, © line
  (app)/                 Authenticated shell: top nav + canvas
    modules/             Flat modular launcher
    modules/dashboard/   KPIs, task volume, attention list
    modules/[slug]/      Tasks, tickets, servers, clients, patching,
                         approvals, renewals, settings
components/
  nav/top-nav.tsx        Two-zone header: wordmark, command palette, notifications
  ui/table.tsx           shadcn/ui table primitives (components.json included)
  ui/                    Buttons, dialogs, data table, status pills
lib/
  roles.ts               Role catalogue + groups + tiers
  modules.ts             Module registry + capability rules
  access.ts              Policy helpers
  task-window.ts         09:00–18:00 IST enforcement
  records/repository.ts  Clients, patching, approvals, renewals
  tasks/repository.ts    Tasks (Supabase with in-memory fallback)
  auth/                  Session token/cookie, Supabase + demo sign-in
  integrations/store.ts  Per-user Redmine / Action1 key vault
supabase/migrations/     RBAC, tasks, business records + RLS
tests/                   node:test suites
```

## 8. Roadmap

1. Redmine sync (assigned tickets, close with comment) using per-user keys.
2. Action1 sync for the server inventory and patching compliance.
3. Record history: comments, attachments and an audit log viewer.
4. Notification jobs (renewal reminders, approval nudges).
5. Role administration UI for IT Manager backed by `profiles.role`.
6. Move integration keys to Supabase Vault with rotation.
