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
`wordmark-inverse.svg`). The tab icon is the bare "T" from the same face — no
container, no box, no shadow: navy on light tab strips, warm gold in dark mode.

**Navigation:** a 64px top bar with the wordmark flush left and the utilities
flush right — search (⌘K), approval notifications and the account menu. There is
no mega-menu: the Modules launcher (a flat 3/2/1-column canvas with
oversized watermark icons) is the hub and the palette jumps to any page.
Restricted pages never appear in either. Once a module is open, a
one-row breadcrumb under the header shows `Modules / <module>` (and any
nested pages below it).

**Launch screen:** a successful sign-in sets a one-shot `tt_intro` cookie
(`lib/auth/intro.ts`, 90s TTL) that makes `components/intro/launch-intro.tsx`
hold a clean white stage on the first page behind the login: the wordmark,
painted from the same `--color-navy` token as the page headings, fades and
scales in from a blur, one gold light sweep crosses the letterforms, and a
three-ring orbit loader (`.tt-loader` in `globals.css` — three 3px gold arcs on
tilted planes, 1s linear) spins while real initialisation finishes. No copy, no
halo, no glow, no shadow. It waits on real initialisation (server-rendered session and
data, `document.fonts.ready`, layout, brand art) with a 6s guard, honours
`prefers-reduced-motion`, keeps the page `inert` while it runs, reveals the
Modules page — whose grid cascades tile by tile, because
`ModulesGrid` waits on `IntroRevealContext` for the reveal rather than
animating behind the overlay — then clears the cookie through
`dismissIntroAction()`. Because the cookie is gone afterwards it never replays
on internal navigation or a refresh. The login and Modules screens themselves
are untouched.

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
capability, every module) and is the only role that can open **Users & Groups**. It is
excluded from `VISIBLE_ROLES`, so it never appears in a task/client/patch owner
picker, the role catalogue or the directory itself — the account that holds it is
filtered out of the Users list too. Provision it by hand in the database; the
sign-up trigger downgrades any request for `super_admin` to "unassigned".

The super admin is also the only account that administers the directory: it adds
employees from **Users & Groups → Manage Users → Add user**, suspends or
reactivates them, deletes them, and opens a read-only profile with **View**.
**Add user** is an inline panel, never a dialog: Employee name, Employee ID,
Employee designation, Work email, Access level, Access group and a temporary
password — all seven required. The Access group is a searchable picker fed by the
groups created in Manage Groups, and the membership row is written straight after
the account exists. `profiles.employee_id` is unique (case- and
space-insensitive), so the same employee number cannot be issued twice.

The second sub-module, **Manage Groups**, builds named groups (Service Desk,
Infrastructure, …) and puts people in or out of them; membership is a
`user_group_members` row, so removing a person from a group never touches the
account. Groups are readable and writable only by the super admin
(`supabase/migrations/0017_user_groups.sql`). Creating an account, changing a
status and deleting all run through `security definer` functions
(`admin_create_user`, `admin_set_user_status`, `admin_delete_user` in
`supabase/migrations/0007_user_administration.sql`, extended with the employee id
in `0018_employee_id.sql`) that re-check the caller's
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
| Masters | Everyone | — | IT + leadership | — | — |
| Settings | Everyone | — | Everyone (own keys) | — | IT Manager, Management |
| Users & Groups | Super Admin | Super Admin | Super Admin | — | Super Admin |

\* **Task creation window** — engineers may only raise new tasks between **09:00 and
18:00 IST**; leads, managers, the IT Manager and management can raise tasks 24 hours a day.
The window is checked in the server action (`assertCanCreateTask`) against the
server clock, never the browser. Boundary tests live in `tests/task-window.test.ts`.

Users & Groups carries two sub-module tabs under its heading —
**Manage Users** (`/modules/users`) and **Manage Groups**
(`/modules/users/groups`) — mirroring the tab pattern below.

Task Management carries three sub-views under its heading, selected with the
`view` query parameter: **Requested Tasks** (`/modules/tasks`, the full queue),
**Task Assigned To Me** (`?view=mine`, work where the signed-in account is the
assignee) and **Task Assigned To My Group** (`?view=group`, work whose assignee's
access level sits in the same role group).

Every row carries an options menu: **View task** (full record and notes),
**Change status**, **Edit task** and **Update notes** (an append-only,
timestamped log). The menu only offers what the role may do: viewing is open to
anyone who can see the row; status and notes belong to the assignee, their team
or leadership; editing is leadership-only (`tasks.edit` in the registry).

**Status is a required field** with six workflow states, each carrying its
meaning on the form and in the status panel:

| Status | Meaning |
| --- | --- |
| To Do | Yet to start. |
| In Progress | Work has started. |
| Completed | The task is done. |
| Feedback | The assignee has finished; the requester has not confirmed it yet. |
| Failed | The deployment went live but did not work, so a rollback has started. |
| Reopen | Work reported complete hit a new issue; it comes back to this task. |

Only **Completed** closes a task; Feedback, Failed and Reopen stay open on the
dashboard. The states live in `lib/tasks/options.ts` and are enforced twice — in
the server action and by `tasks_status_check`
(`supabase/migrations/0019_task_assignee_status.sql`, which also rewrote the old
`done` rows to `completed`).

Forms are **pages, not popups**. `/modules/tasks/new` renders the full create
form and `/modules/tasks/<id>/edit` the edit form; the task page
(`/modules/tasks/<id>`) carries the inline status control and note composer as
anchored sections (`#status`, `#notes`). Nothing about a task opens in a dialog.

The create form captures, in order: **Task ID** (generated on save, read only),
**Task name**, **Task description**, **Client name**, **Activity type** (from
Masters, see below),
**Requested by** and **Requester email** (auto-captured from the session, read
only), **Server details**, **Planned / unplanned**, **Communication**,
**Reference ticket no.**, **Assigned to**, **Status** and **Priority**.

Two of those fields are search dropdowns, not free text:

- **Server details** lists the endpoints the Servers module reads from Action1
  (name, with OS and IP as the second line). One pick is stored by name in
  `tasks.server_details`. When Action1 is not connected the field falls back to
  a text input and says why, so a task can still be raised.
- **Assigned to** lists active people from Users & Groups (name, with their
  access level beneath). The chosen profile id is stored in `tasks.assignee_id`
  with a name snapshot in `assignee_name`; `assignee_role` is derived from that
  person server-side, never from the posted body. The list comes from the
  `assignable_users()` RPC, so no profile policy had to be widened.

Schema: `supabase/migrations/0009_task_request_details.sql` and
`0019_task_assignee_status.sql`; notes: `0008_task_notes.sql`.

### Table tools

Every table (`components/ui/data-table.tsx`) is customisable per operator and
remembers the choices in `localStorage` under `tt.table.v1.<tableId>`:

- **Search** across every column, **sort** by clicking a header (with `aria-sort`).
- **Columns** panel — show or hide columns and move them left/right; the first
  column can never be hidden and the panel shows how many are on screen.
- **Rows** per page — 8 / 10 / 25 / 50 / all, with the pager hidden when a
  single page fits.
- **Density** — comfortable or compact row height.
- **Export** — the current filter and sort downloaded as UTF-8 CSV.
- **Reset** — back to the shipped defaults.

Task Management additionally carries the request-detail columns (client,
activity, planned/unplanned, reference ticket); activity and ticket start
hidden so the board stays readable.

**Masters** holds master data, not links to other modules. Its only register is
**Activity types** (the vocabulary behind the task form); Clients, Renewals and
Patching Plans stay in their own modules and are not repeated here.

### Activity types (master data)

The task form's **Activity type** dropdown is not a constant in the code: it is
`public.activity_types`, managed at
[`/modules/masters/activity-types`](app/(app)/modules/masters/activity-types/page.tsx).
The page is an inline form (no popup): type a name, press **Add type**, and the
type is immediately offered on `/modules/tasks/new` and the edit form.

- Every type records the **module** it belongs to — a required choice from Task
  Management, Ticket Portal, Servers, Patching Plans, Clients, Renewals or
  Approvals. The module decides where the type is offered: the task form reads
  `listActiveActivityTypes("tasks")` and nothing else.
- Names are trimmed, inner whitespace collapsed and unique **per module**
  (`activity_types_module_name_unique`), so "Service request" can exist for both
  Task Management and Ticket Portal. Validation lives in `lib/activity-types.ts`.
- **Edit** opens `/modules/masters/activity-types/<id>` — a full page (no popup)
  that renames the entry or moves it to another module, then returns to the
  register with a confirmation line. Renaming does not rewrite records that
  already stored the old wording.
- **Deactivate** retires a type without touching tasks that already recorded it —
  only active types appear in the form. **Delete** removes it from the register;
  stored task text is left alone. Deletion never fires straight from the row:
  `?delete=<id>` opens an in-page confirmation panel (what is filed where, what
  happens to existing records, *Yes, delete this type* / *Keep it*), so there is
  no browser dialog and no accidental click-through.
- The register is seeded with the eight types that used to be hard-coded, so an
  existing board sees no change.
- Server-side, `createTaskAction` / `updateTaskAction` re-check the submitted
  value against the live register; a crafted post cannot invent a type.
- Editing the register needs `masters.edit` (IT Manager and leadership), enforced
  in the UI and by RLS (`public.can_edit_masters()`).

### Clients

`/modules/clients` is the account register and `/modules/clients/new` is the
full-page create form (no popup). One client records:

| Field | Where it goes |
| --- | --- |
| Client name | `clients.name`, required |
| Short code / license code | `clients.code`, upper case; derived from the name when left blank |
| Industry | `clients.industry` |
| Primary contact name / email / mobile | `primary_contact_name`, `primary_contact_email`, `primary_mobile_country` + `primary_mobile` |
| Secondary contact name / email / mobile | the `secondary_*` twins |
| Account owner | `clients.owner_role` (role, drives the ownership groups) |
| Assigned user | `assigned_user_id` + a denormalised `assigned_user_name` |
| Created / last update | `created_at` and `updated_at`, stamped by the database — never typed |

- **Country code with search.** The mobile fields are a searchable picker
  (`components/ui/country-code-field.tsx`) over `lib/countries.ts` — 250
  countries, searchable by name, ISO code or dial code ("india", "IN" and "+91"
  all reach India). The picker stores the ISO code; the number is stored as
  digits only (6–15, checked by `clients_*_mobile_digits`).
- **Edit** opens `/modules/clients/<id>/edit` with the same form, prefilled
  (`Save changes`), and returns to the register with a "was updated" line. The
  created stamp never moves; the database trigger moves `updated_at`.
- **Industry** is a dropdown fed by `Masters → Industries`, not free text;
  a client that stored a value the register no longer holds keeps that value
  selected until it is changed.
- **Validation** lives in `lib/clients.ts` (pure, tested): name 2–160, code
  ≤20 with `A–Z 0–9 - _ . /`, and for each contact a valid email plus a valid
  mobile whenever a number is typed.
- **Assigned user** is resolved server-side against the directory, so a crafted
  post cannot invent a name. Profiles are readable only by the super admin, so
  the app calls the `assignable_users()` RPC (security definer, names only) and
  falls back to the directory it can already see.
- The register shows every field as a column (all of them visible by default;
  the table scrolls sideways and the Columns control can hide any of them).
  Deactivate keeps history, as with the other registers.
- **Delete** sits last in each row's menu, behind the browser confirm that names
  the account. It needs `clients.edit`, goes through
  `updateClientStatusAction` (value `delete`) into `deleteClientRecord()`, and
  cascades the client's custom-field answers with it.
- **Import** (`/modules/clients/import`) takes a CSV file or pasted rows — never
  a popup. The template is generated from `CLIENT_IMPORT_COLUMNS`, so its header
  can never drift from the parser. Rows are validated with the same rules as the
  form (`lib/clients.ts`), matched case-insensitively against the register by
  name and short code, and reported as "N clients imported, M skipped." with one
  line per skipped row. Up to 500 rows / 512 KB per run; the CSV parser handles
  quoted cells, embedded commas and CRLF (`lib/clients-import.ts`, tested).

### Industries

`/modules/masters/industries` is the Industry register the client form draws
from — same shape as activity types: inline add form, Edit page
(`/modules/masters/industries/<id>`), Deactivate, and Delete behind the in-page
confirm panel (`?delete=<id>`).

- Names are trimmed, inner whitespace collapsed and unique case-insensitively
  (`industries_name_unique`); rules live in `lib/industries.ts`.
- The register was seeded with 16 common industries plus any industry the client
  table already stored, so no existing account lost its wording.
- Deleting never rewrites a client: the record keeps the text it stored.

### Custom fields

`/modules/masters/custom-fields` defines extra fields, and **each one is filed
under exactly one module** — the module selection is required on the add form
and on the edit page.

- Modules are the workspace's own list (Task Management, Ticket Portal, Servers,
  Patching Plans, Clients, Renewals, Approvals), taken from
  `CUSTOM_FIELD_MODULE_OPTIONS` so the vocabulary matches activity types.
- Uniqueness is per module (`custom_fields_module_name_unique`), so "Contract
  reference" can exist for Clients and for Ticket Portal at the same time.
- Edit renames the field or moves it to another module; Deactivate/Delete behave
  like the other registers, deletion behind the same designed confirm panel.
- **Pointing a field at a module displays it there automatically.** No per-module
  wiring: every form asks `listModuleCustomFields(<module>)` and renders what it
  gets with `components/ui/custom-fields.tsx` (named `custom:<fieldId>`), and the
  server action writes the answers through `saveCustomFieldValues()` /
  `readCustomFieldForm()`. Today the Clients and Task Management forms consume
  it; adding it to another module is one `<CustomFields …>` line plus those two
  calls.
- Answers live in `custom_field_values (field_id, record_id, value)` (migration
  `0020`), keyed by text record id — `CL-1001`, `TSK-1042` — so one table serves
  every module. Deleting a field cascades its answers; clearing a field stores an
  empty string rather than dropping the row.

The registry lives in [`lib/modules.ts`](lib/modules.ts) and [`lib/roles.ts`](lib/roles.ts);
edit those two files to change policy. `lib/access.ts` exposes `can()`,
`canAccessModule()`, `visibleModules()` and `accessMap()`.

### Patching Plans

`/modules/patching` is the endpoint register for patching. Each row is one
server from the Servers module (Action1), so the counts and the plan sit
together:

| Column | Source |
| --- | --- |
| Endpoint | `endpoints/managed/{orgId}` — the name links to `/modules/servers/<id>`, whose Patching tab lists the updates themselves |
| Missing patches | `missing_critical` as Action1 reports it (`—` when the tenant returns no patch fields) |
| Other updates | `missing_other` |
| Scheduled plan | `patch_schedules.planned_date` with the IT member who handles it beneath |
| Approval | Approved / Rejected / Pending, derived from the approvers' decisions |

- **Scheduling** is inline, never a dialog. Tick one or more endpoints (the
  header checkbox takes the whole filtered list), then *Schedule plans*: one
  planned date, one IT member, and any number of approvers (multi-select of the
  staff directory), plus an optional note. Saving writes one plan per endpoint
  and sends the approval to the people named.
- Scheduling an endpoint that already has a plan replaces the date, handler and
  approvers and resets every decision to pending — a changed plan is signed off
  again.
- **Approval** is per person: an approver opens *Approve* on the row, names the
  person who verified the patching (required to approve, not to reject) and
  decides. A plan is Approved when every approver has approved, Rejected when
  anyone rejects, and Pending until then. Only the named approvers can decide —
  the same rule the RLS on `patch_schedule_approvers` enforces
  (`approver_id = auth.uid()` or leadership).
- **Report**: with endpoints ticked, *Prepare report* opens
  `/modules/patching/report?plans=…`. The sheet carries the wordmark, and per
  endpoint: planned date, endpoint name, IT member handling the patching,
  approved provided by, verified by, and the patch table — S.No, patch name
  (with its KB), CVE and severity. Patch data is read live from Action1 when the
  report opens; a tenant that is unreachable prints a line instead of an empty
  table. *Print or save as PDF* hands the sheet to the browser; the print
  stylesheet hides the navigation, breadcrumbs, footer and in-page buttons.
- Limits: 25 endpoints per schedule action and per report, 10 approvers per
  plan, planned dates must be today or later (IST).

Data lives in `patch_schedules` (one row per endpoint, `endpoint_id` unique) and
`patch_schedule_approvers` (one row per approver, carrying the decision, the
verification name and the note) — migration `0021`. The older
`patch_plans` table is untouched but no longer shown.

## 4. Data

| Table | Rows in this build | Notes |
| --- | --- | --- |
| `tasks` | 5 seeded + runtime | Assignee, status, priority, due date |
| `clients` | 4 seeded | Two contacts + mobiles, industry, owner, assignee, stamps |
| `patch_plans` | 3 seeded | Window, ring, owner, status |
| `approvals` | 4 seeded | Change/access/patch/purchase, decision trail |
| `renewals` | 4 seeded | Value, currency, notice period, status |

All four record tables (plus `tasks`) have RLS: any authenticated user can read,
rows are inserted as the signed-in user, updates are limited to the creator or
leadership, and approvals can only be decided by leadership. Schemas live in
`supabase/migrations/0001_rbac.sql`, `0002_tasks.sql`,
`0003_business_records.sql`, `0013_client_contacts.sql` and
`0014_industries_custom_fields.sql` (plus `0015_integration_config.sql` for the
integration settings column); the hidden role, its directory policy and the first
super-admin account live in `0004_super_admin_role.sql` and
`0005_super_admin_account.sql`; user administration lives in
`0007_user_administration.sql`.

## 4a. Ticket Portal (Redmine REST API)

The portal reads live from Redmine using the per-user key saved in Settings. It
implements the documented API
([redmine.org/projects/redmine/wiki/rest_api](https://www.redmine.org/projects/redmine/wiki/rest_api)):

| Call | Used for |
| --- | --- |
| `GET /issues.json?assigned_to_id=me&status_id=open&sort=updated_on:desc&limit=100` | “Assigned to me” (and “All open” without `assigned_to_id`) |
| `GET /projects.json?limit=100` | project dropdown on the new-ticket form |
| `GET /users/current.json` | credential check / login name |
| `POST /issues.json` | raising a ticket (`Content-Type: application/json`) |
| `GET /issues/<id>.json?include=journals` | one ticket plus its journal comments |
| `GET /issue_statuses.json`, `GET /enumerations/issue_priorities.json` | status and priority dropdowns on the edit page |
| `GET /projects/<id>/memberships.json?limit=100` | assignee dropdown on the edit page |
| `PUT /issues/<id>.json` | saving subject, description, status, priority, assignee and an update comment (Redmine answers `204`) |

Notes taken from the reference:

- The key travels in the **`X-Redmine-API-Key`** header — never in the URL, so it
  cannot leak through logs or referrers.
- Collections are capped at `limit=100`; `total_count`, `limit` and `offset` are
  read back for the counters.
- Failures are translated into advice: `401` → “Redmine rejected the API key”,
  `404` → “Check the instance URL”, `422` → Redmine's own validation text.
- Requests time out after 12 s, so a wrong URL cannot hang the page.

Client: `lib/integrations/redmine.ts` (network calls plus pure mapping helpers),
portal loader: `lib/tickets/portal.ts`, UI: `components/modules/tickets-view.tsx`
with the create form at `/modules/tickets/new` (inline, no popup).

Each portal row has an **Edit** action that opens `/modules/tickets/<id>` — a
full page showing the issue, its journal and an inline edit form (subject,
description, status, priority, assignee and an optional comment merged into the
same `PUT`). Saving redirects back to the issue with an “updated” banner; a
`422` from Redmine is shown against the form instead of being swallowed.

### Where the key is stored

Settings writes credentials to `public.user_integrations`
(`supabase/migrations/0012_user_integrations.sql`, extended by
`0016_action1_shared_credential.sql`). The secret is encrypted in the app with
**AES-256-GCM** (key derived from `AUTH_SECRET`) before it reaches Postgres, and
only the last four characters are kept in the clear, for masking. Changing
`AUTH_SECRET` invalidates saved secrets — they must be entered again.

The two providers are scoped differently:

- **Redmine — per profile.** Each portal reads the issues *that person* is
  assigned, so RLS limits the row to `auth.uid()`.
- **Action1 — per organisation.** The endpoint inventory is the company's, so
  there is one connection: Super Admin, IT Manager and IT Engineer can all save
  or replace it (checked in the action and again by RLS through
  `can_manage_action1()`), and every signed-in colleague reads the newest
  Action1 row — leadership included, so a manager can open Servers without a key
  of their own. What is shared is the ciphertext; decryption happens in the app.

Both providers share that vault; Action1 stores its non-secret client id and
organization id in the `config` JSON column added by
`0015_integration_config.sql`.

## 4b. Servers (Action1 API)

The Servers module has no local table — it reads the managed endpoint inventory
from Action1 on every load, using the organisation's API credentials from
Settings. It implements the published reference
([app.na-2.action1.com/apidocs](https://app.na-2.action1.com/apidocs/), API
v3.0, North America 2):

| Call | Used for |
| --- | --- |
| `POST /oauth2/token` (client credentials) | exchanging the client id + secret for a bearer token (1 h TTL), once per request |
| `GET /organizations` | resolving the organization id when none is configured |
| `GET /endpoints/managed/{orgId}?from=0&limit=50&fields=*` | paged endpoint inventory (name, OS, status, last seen, IP, agent version, missing updates, reboot) |
| `GET /endpoints/managed/{orgId}/{endpointId}?fields=*` | the endpoint detail page |
| `GET /endpoints/managed/{orgId}/{endpointId}/missing-updates?from=0&limit=100&fields=*` | the updates behind the counts — name, KB, CVE, severity, current and available version, release date, approval (falls back to `/updates/{orgId}?endpoint_id=…` when a tenant 404s the per-endpoint route) |

Notes taken from the reference:

- The token goes in an `Authorization: Bearer …` header; the client secret is
  never put in a URL.
- Collections are `ResultPage` objects — `items`, `total_items`, `limit` and
  `next_page` — and the module pages them with `from`/`limit` until the
  inventory is complete, capped at 200 endpoints so one huge tenant cannot stall
  the page. `fields=*` asks for the extended field set; the two patch counts are
  the documented extras (`missing_critical_updates`, `missing_other_updates`).
- Patch counts are read defensively: if a tenant ignores `fields=*`, the first
  page (and the endpoint detail call) is re-read with those two fields named
  explicitly. If they still come back absent the patch figures show **“—”**
  rather than a misleading 0, with a note that the API key may not be allowed to
  read update data — Action1 sends `""` when an endpoint simply has nothing
  missing, and that reads as 0.
- Action1 dates arrive as `YYYY-MM-DD_HH-mm-ss` in UTC and are normalised
  before formatting in IST.
- Failures are translated into advice: `401` → “Action1 rejected the
  credentials”, `403` → permissions, `404` → organization id, `429` → rate
  limiting, `5xx` → Action1's own server error. Requests time out after 12 s.

Client: `lib/integrations/action1.ts` (token, endpoints, missing updates,
organizations plus pure mapping helpers), loader: `lib/servers/inventory.ts`,
presentation helpers: `lib/servers/endpoint.ts`, UI:
`components/modules/servers-view.tsx`, and the endpoint page at
`/modules/servers/<id>` — `components/modules/endpoint-tabs.tsx` splits it into
**Overview / Patching / Hardware / Network** tabs. The Patching tab lists the
missing updates themselves (not just the counts), filterable by severity
Critical / Important / Moderate / Low / Other, with KB and CVE references, the
installed → available version, release date and approval state.
Super Admin, IT Manager and IT Engineer can all write the Action1 credentials;
the connection is organisation-wide, so whoever saves it is the one the Servers
module uses for everybody.

## 4c. Response times (why modules were slow, and what fixed it)

Switching modules used to take tens of seconds — over two minutes against a slow
Action1 tenant. The cause was not the database: **every navigation re-ran the
whole Action1 handshake**. Servers, Patching, the Task form and the overview all
call `loadServersInventory()`, and that read signed in again
(`POST /oauth2/token`), resolved the organization id again
(`GET /organizations`), then paged `/endpoints/managed/{orgId}` **one page after
another** — six sequential round trips per page view, each with a 12 s timeout.
Five modules × six calls × 1–3 s is exactly the "two minutes" that was reported,
and nothing was reused between renders, between modules or between two people.

The fix is a small in-process cache ([`lib/cache/ttl.ts`](lib/cache/ttl.ts)) in
front of every read that repeated itself, plus parallel paging:

| Cached value | TTL | Busted by |
| --- | --- | --- |
| Action1 access token | token `expires_in` − 60 s (max 25 min) | saving/disconnecting Action1 |
| Resolved Action1 organization id | 10 min | saving/disconnecting Action1 |
| Endpoint inventory (org-wide) | 60 s | Refresh, saving/disconnecting Action1 |
| Endpoint detail + its missing updates | 45 s | Refresh, saving/disconnecting Action1 |
| Connection record (`getIntegration`) | 30 s | saving/disconnecting |
| Signed-in profile status (suspension check) | 30 s | — |
| Assignable users (Task/Patching owner lists) | 30 s | any user mutation |
| Pending approvals (nav badge) | 30 s | any approval decision |
| Redmine ticket list / projects | 30 s / 5 min | any ticket write |

Other changes in the same pass:

- Pages 2..n of the inventory are fetched **four at a time** instead of
  sequentially, under a 12 s wall-clock ceiling so a hung tenant cannot hold a
  render forever. If the ceiling is reached the page shows what it has and the
  remaining pages are fetched **in the background**, so the next visit inside the
  TTL is complete.
- The Servers table is paginated (25 rows) instead of rendering the entire
  inventory: the page dropped from ~910 KB of HTML to ~130 KB.
- Redmine's ticket editor loads the issue together with statuses and priorities
  before its member lists instead of nesting them.
- `loading.tsx` boundaries give an instant skeleton on every module route, and
  `experimental.staleTimes` (30 s dynamic / 300 s static) lets the router reuse a
  page it already has when you switch back and forth, instead of refetching it.
- Every mutation clears the prefixes it invalidates (`action1-`, `tickets:`,
  `integration:`, `assignable-users`, `pending-approvals`), so cache never hides
  a change the user just made.

Measured locally against a mock Action1 API (200 endpoints, 4 pages) with a
production build and the same code before and after:

| Page | Before (400 ms per call) | Before (3 s per call) | After, first visit | After, every later visit |
| --- | --- | --- | --- | --- |
| Servers | 2.5–2.7 s | 18.3 s | 1.8 s (12.1 s at 3 s/call, completed in the background) | 0.02–0.04 s, 0 API calls |
| Patching | 2.6 s | 18.2 s | 0.21 s (inventory reused) | 0.09 s, 0 API calls |
| Tasks (new) | 2.4 s | 18.1 s | 0.06 s (inventory reused) | 0.02 s, 0 API calls |
| Dashboard, Tickets, Clients, Users, Approvals | — | — | 0.03–0.05 s | 0.01–0.05 s |

Before: one token + one organization + four page calls on **every** navigation.
After: one token + one organization + four page calls **once per minute per
connection**, and none at all for the other modules in between.

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
    modules/tasks/       Board views, /new, /<id>, /<id>/edit
    modules/servers/     Endpoint inventory, /<id> endpoint detail
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
  integrations/store.ts  Per-user Redmine / Action1 key vault (Supabase, encrypted)
  integrations/vault.ts  AES-256-GCM envelope for stored secrets
  integrations/redmine.ts Redmine REST client (issues, projects, create, update)
  integrations/action1.ts Action1 client (OAuth token, endpoints, organizations)
  servers/inventory.ts   Server inventory loader + endpoint detail state
  servers/endpoint.ts    Pure inventory helpers (summary, patch/reboot wording)
  tickets/portal.ts      Portal loaders: credentials, issue list, one issue
supabase/migrations/     RBAC, tasks, business records + RLS
tests/                   node:test suites
```

## 8. Roadmap

1. Redmine attachments from the portal (issue uploads token).
2. Action1 patching actions from the inventory (deploy updates, reboot rings).
3. Record history: comments, attachments and an audit log viewer.
4. Notification jobs (renewal reminders, approval nudges).
5. Role administration UI for IT Manager backed by `profiles.role`.
6. Key rotation and audit trail for the integration vault.
