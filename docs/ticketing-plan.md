# Native ticketing — build plan (Zammad parity)

The ticketing module started life as a Redmine proxy: it read issues from a
personal Redmine API key and wrote new ones back there. Nothing was ours — no
queue, no state machine, no SLA, no history — so the module could only ever be a
window onto a system we do not control.

This is the plan to make ticketing our own, using the Zammad admin
documentation (<https://admin-docs.zammad.org/en/latest/index.html>) as the
feature map. It is deliberately shaped like the rest of TaskTornado: Postgres
tables with RLS, master registers for admin-managed lists, server actions for
writes, and one module page per concern.

---

## 1. Module map

Every module in the Zammad admin docs, and where it lands here.

| Zammad module | What it does | TaskTornado home | Phase |
| --- | --- | --- | --- |
| **Tickets** | The agent workspace: list, detail, articles, reply, note | `/modules/tickets`, `/modules/tickets/[id]` | **1 — shipped** |
| **States / Priorities** | Ticket state machine and priority scale | Fixed ladder in `lib/tickets/core.ts` (no admin surface needed) | **1 — shipped** |
| **Groups** (queues) | Team inbox a ticket belongs to | Existing `user_groups` (Users → Groups) — the queue picker reads them | **1 — shipped** |
| **Tags** | Free-text labels on a ticket | `tickets.tags`, editable on the detail page | **1 — shipped** |
| **Time Accounting** | Hours booked against a ticket | `ticket_articles.time_minutes` + per-ticket total | **1 — shipped** |
| **Users** | Agents and customers | `profiles` directory (already exists) | **1 — shipped** |
| **Roles / permissions** | Who may see and change what | `lib/access.ts` capability matrix on the `tickets` module | **1 — shipped** |
| **Organizations** | Customer company records | `tickets.client_id` → `clients`, picker on create and in the sidebar | **2 — shipped** |
| **Overviews** | Saved list filters ("My assigned", "Unassigned", …) | Four tabs + filter bar (queue/state/priority/tag/owner) + per-person saved overviews | **2 — shipped** |
| **Checklist** | Sub-items inside one ticket | `ticket_tasks` + sidebar panel + `2/3` in the list | **2 — shipped** |
| **Links / merge** | Related, parent/child, duplicate | `ticket_links`, `merged` state, merge action | **2 — shipped** |
| **Macros** | One-click bundle of changes | `ticket_macros`, Masters page, apply action | **2 — shipped** |
| **Text Modules** | Snippets inserted into replies | Masters → Text modules + picker in the reply box | **2 — shipped** |
| **Triggers** | If-this-then-that on ticket events | `ticket_triggers` evaluated in the write path | 3 |
| **SLAs** | First-response / solution targets per queue+priority | `ticket_slas` + `due_at`/`first_response_at` | 3 |
| **Calendars** | Business hours used by SLA maths | `ticket_calendars` (Mon–Fri 09:00–18:00 IST default) | 3 |
| **Scheduler** | Time-based jobs (auto-close, reminders) | Next.js cron route | 3 |
| **Report Profiles / Reporting** | Counts by queue, agent, state over time | `/modules/tickets/reports` | 3 |
| **Knowledge Base** | Public + internal articles | `/modules/tickets/kb` | 4 |
| **Channels: Web** | Agent-created ticket (already) | Phase 1 | **1 — shipped** |
| **Channels: Form** | Public web form → ticket | `/support/new` (no sign-in, rate limited) | 4 |
| **Channels: Email** | IMAP/Graph inbox → ticket | Integration + inbound route | 4 |
| **Channels: Chat / SMS / WhatsApp / Telegram / Facebook** | Messaging channels | Out of scope until a provider is contracted | — |
| **AI: summary, writing assistant, KB assistant** | LLM helpers on a ticket | `/api/tickets/summarise` behind a setting | 5 |
| **Webhook / Public Links / Security / Branding** | Admin plumbing | Mostly covered by existing Settings; public links in 4 | 2 / 4 |

Phases are cumulative: each one ships on its own and leaves the module usable.

---

## 2. Phase 1 — the ticket itself (this build)

Goal: a ticket exists in our database, moves through our states, and keeps its
own history.

**Schema** (`0024_tickets.sql`)

- `tickets` — id `TT-<n>` from a sequence, subject, state, priority, queue
  (`user_groups`), owner, requester, channel, tags, `due_at`, `closed_at`.
- `ticket_articles` — the conversation. One row per message: `web` (public
  reply), `note` (internal), `system` (state/assignment changes written by the
  app), `email`/`phone`. Carries author, body and optional `time_minutes`.
- RLS: every signed-in user reads; an agent creates a ticket as themselves and
  can append articles; leadership can delete.

**Behaviour**

- State ladder `new → open → pending → closed`, where closing stamps
  `closed_at` and reopening clears it; `pending` means "waiting on the
  requester" and is not counted as work in progress.
- Priority ladder `low → normal → high → urgent`.
- 4-ticket list views: **Assigned to me**, **Unassigned**, **All open**,
  **Closed** — the Overviews module in embryo.
- Detail page: full article thread (internal notes styled apart), reply box,
  internal-note box, and a sidebar for state, priority, queue, owner, tags.
- Every state/priority/owner/queue change writes a `system` article, so the
  thread is the audit trail — no separate log to drift.
- Time booked on a reply is summed per ticket and shown in the header.

**Permissions** — `tickets` module capabilities: `view` all; `create` all (any
signed-in user may raise); `edit` IT, IT engineer and leadership (agents);
`admin` IT. Non-agents see their own tickets and the queues they raised in —
never internal notes.

**Acceptance**

1. A ticket raised in the app appears in **Assigned to me** for its owner and
   in **Unassigned** until one is set.
2. Closing a ticket moves it out of the open views and stamps a close date;
   reopening it restores it.
3. An internal note is invisible to a non-agent; a public reply is visible to
   the requester.
4. Renaming or deleting a queue (Users → Groups) leaves existing tickets
   readable — the ticket keeps its own copy of the queue name.
5. The Redmine portal stays reachable at `/modules/tickets/redmine` for the
   teams that still use it.

---

## 3. Phase 2 — make it an agent tool

Shipped in migration `0025_ticket_tools.sql`:

- **Checklists** — `ticket_tasks` per ticket, ticked off in the sidebar; each
  tick writes a `system` line and the list shows `2/3` in its own column.
- **Macros** — `ticket_macros`, four seeded (escalate, waiting on requester,
  close as duplicate, resolved), maintained in **Masters → Ticket macros** and
  applied from a picker on the ticket. A macro applies state, priority, queue
  and a tag in one go and leaves one `system` line saying what changed.
- **Text modules** — `ticket_text_modules`, maintained in **Masters → Text
  modules** (add, edit, deactivate, delete) and inserted into the reply box from
  a picker; the snippet is appended to whatever has been typed.
- **Links and merges** — `ticket_links` (related / parent / child / duplicate)
  shown both ways on both tickets; **Merge** moves the source to the `merged`
  state, writes the duplicate link and a `system` line on both threads. Nothing
  is deleted, and merged tickets leave the open views but stay in Closed.
- **Organizations** — `tickets.client_id` + `client_name` snapshot, chosen when
  raising a ticket or in the sidebar, against the client register.

- **Overviews** — `ticket_overviews`: a filter bar (queue, state, priority, tag,
  owner) on the ticket list, and any filtered view can be saved under a name and
  pinned above the list as a chip. Overviews are per person (RLS is
  `user_id = auth.uid()`), and a chip applies its saved filters to the current
  tab without changing it.

Phase 2 is complete.

## 4. Phase 3 — promises and reporting

- **Calendars + SLAs**: per queue and priority, first-response and
  solution targets measured on business hours; the list shows a countdown and
  an "at risk" flag; breaching writes a `system` article.
- **Triggers**: an if/then table evaluated on ticket create and article create
  (e.g. "subject contains 'outage' → priority urgent, queue Infrastructure").
- **Scheduler**: auto-close after N days pending, reminder articles, SLA
  breach sweep.
- **Reports**: tickets by queue, agent and state per week; median first
  response; reopen rate; exported as CSV.

## 5. Phase 4 — channels and self-service

- **Web form** at `/support/new`: queues offered publicly, spam guard, no login.
- **Knowledge base**: categories, public/internal articles, search, and a
  "suggest an article" panel inside a ticket reply.
- **Email channel**: an integration row for IMAP or Microsoft 365 Graph, an
  inbound route that creates tickets and appends articles, and outbound replies.

## 6. Phase 5 — AI (optional)

Summary of a long thread on demand, a writing assistant for replies grounded in
the knowledge base, and a KB assistant. All behind a setting and off by default
— no ticket text leaves the system unless an admin configures a provider.

---

## 7. Data model (phase 1)

```text
tickets                                ticket_articles
  id            text  TT-1001            id            uuid
  subject       text                     ticket_id     → tickets.id (cascade)
  state         text  new|open|pending   kind          web|note|system|email|phone
  priority      text  low|normal|high|urgent  internal  boolean
  queue_id      → user_groups.id         author_id     → auth.users.id
  queue_name    text (snapshot)          author_name   text
  owner_id      → auth.users.id          author_role   text
  owner_name    text                     body          text
  requester_id  → auth.users.id          time_minutes  int
  requester_name/email  text             created_at    timestamptz
  channel       web|email|phone|chat
  tags          text[]
  due_at / closed_at / created_at / updated_at
```

`queue_name` and the two `*_name` columns are snapshots on purpose: a ticket
must still read correctly after a queue is renamed or a person leaves.

---

## 8. Explicit non-goals

- Telephony, chat widgets, SMS, WhatsApp, Telegram and Facebook channels — no
  provider contracts, and they would each add a webhook surface we cannot test
  from here.
- A visual form designer for the public web form. The form is a fixed set of
  fields over the queue register.
- Replacing Supabase Auth with Zammad's user model. Tickets reference
  `profiles`; customers without an account exist only as `requester_*` fields.
