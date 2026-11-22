-- Native ticketing, phase 2: the agent's tools.
--
-- Checklists (sub-items inside a ticket), links and merges between tickets,
-- macros (one-click bundles of changes) and text modules (reply snippets that
-- live in Masters). Plus the client link, so a ticket can sit against an
-- organization the way Zammad does.
--
-- Mirrors docs/ticketing-plan.md, phase 2.

/* -------------------------------------------------------------------------- */
/*  Agents                                                                    */
/* -------------------------------------------------------------------------- */

-- One place for "who may work a queue", so the policies below cannot drift from
-- lib/modules.ts (SERVICE_DESK).
create or replace function public.is_ticket_agent()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_app_role() in (
    'super_admin','it_manager','it_engineer',
    'l2_support_manager','l2_support_lead','l2_support_engineer',
    'management'
  ), false);
$$;

/* -------------------------------------------------------------------------- */
/*  Tickets: organization and the merged state                                */
/* -------------------------------------------------------------------------- */

alter table public.tickets add column if not exists client_id text;
alter table public.tickets add column if not exists client_name text not null default '';

-- `clients` is a business record owned by another module; the reference is soft
-- so a client can be removed without blocking a ticket.
comment on column public.tickets.client_id is
  'Optional public.clients id; client_name keeps the snapshot.';

alter table public.tickets drop constraint if exists tickets_state_check;
alter table public.tickets add constraint tickets_state_check
  check (state in ('new','open','pending','closed','merged'));

alter table public.tickets drop constraint if exists tickets_priority_check;
alter table public.tickets add constraint tickets_priority_check
  check (priority in ('low','normal','high','urgent'));

/* -------------------------------------------------------------------------- */
/*  Checklists                                                                */
/* -------------------------------------------------------------------------- */

create table if not exists public.ticket_tasks (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null references public.tickets(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  done boolean not null default false,
  position integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ticket_tasks_ticket_idx
  on public.ticket_tasks (ticket_id, position);

/* -------------------------------------------------------------------------- */
/*  Links and merges                                                          */
/* -------------------------------------------------------------------------- */

create table if not exists public.ticket_links (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null references public.tickets(id) on delete cascade,
  target_id text not null references public.tickets(id) on delete cascade,
  kind text not null default 'related'
    check (kind in ('related','parent','child','duplicate')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ticket_links_distinct check (ticket_id <> target_id),
  constraint ticket_links_unique unique (ticket_id, target_id, kind)
);

create index if not exists ticket_links_ticket_idx on public.ticket_links (ticket_id);
create index if not exists ticket_links_target_idx on public.ticket_links (target_id);

/* -------------------------------------------------------------------------- */
/*  Macros                                                                    */
/* -------------------------------------------------------------------------- */

create table if not exists public.ticket_macros (
  id text primary key,
  name text not null,
  description text not null default '',
  set_state text check (set_state in ('new','open','pending','closed')),
  set_priority text check (set_priority in ('low','normal','high','urgent')),
  set_queue text references public.ticket_queues(id) on delete set null,
  add_tag text not null default '',
  note text not null default '',
  status text not null default 'active' check (status in ('active','inactive')),
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create unique index if not exists ticket_macros_name_key
  on public.ticket_macros (lower(btrim(name)));

insert into public.ticket_macros
  (id, name, description, set_state, set_priority, set_queue, add_tag, note, sort_order)
values
  ('escalate', 'Escalate to infrastructure', 'Hand it to the infrastructure queue at high priority',
   'open', 'high', 'infrastructure', 'escalation',
   'Escalated to Infrastructure at high priority.', 10),
  ('waiting-on-user', 'Waiting on the requester', 'Park it until the requester answers',
   'pending', null, null, 'awaiting-requester',
   'Waiting on the requester for more information.', 20),
  ('close-duplicate', 'Close as duplicate', 'Close it and tag it as a duplicate',
   'closed', null, null, 'duplicate',
   'Closed as a duplicate of an existing ticket.', 30),
  ('resolved', 'Mark resolved', 'Close it and tag it resolved',
   'closed', null, null, 'resolved',
   'Resolved and closed.', 40)
on conflict (id) do nothing;

/* -------------------------------------------------------------------------- */
/*  Text modules (Masters → Text modules)                                     */
/* -------------------------------------------------------------------------- */

create table if not exists public.ticket_text_modules (
  id text primary key,
  name text not null,
  body text not null,
  keywords text not null default '',
  status text not null default 'active' check (status in ('active','inactive')),
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create unique index if not exists ticket_text_modules_name_key
  on public.ticket_text_modules (lower(btrim(name)));

insert into public.ticket_text_modules (id, name, body, keywords, sort_order) values
  ('acknowledge', 'Acknowledge and set expectations',
   E'Thanks for raising this — we have it in the queue and an agent will pick it up today.\n\nWe will come back with the next step as soon as we have looked at it.',
   'ack, received', 10),
  ('need-screenshot', 'Ask for a screenshot',
   E'Could you send a screenshot of the error, along with the time it happened?\n\nThat usually tells us whether it is the app or the connection.',
   'screenshot, error', 20),
  ('vpn-restart', 'VPN restart steps',
   E'Please try the following before we dig deeper:\n\n1. Disconnect the VPN client completely.\n2. Restart the machine.\n3. Reconnect and note the time it drops again.\n\nIf it still drops, reply here with the time and we will raise it with the carrier.',
   'vpn, reconnect', 30),
  ('closing-note', 'Closing note',
   E'This is resolved on our side and the ticket is being closed. If it comes back, reply here and it will reopen with the full history.',
   'close, resolved', 40)
on conflict (id) do nothing;

/* -------------------------------------------------------------------------- */
/*  Policies and grants                                                       */
/* -------------------------------------------------------------------------- */

alter table public.ticket_tasks enable row level security;
alter table public.ticket_links enable row level security;
alter table public.ticket_macros enable row level security;
alter table public.ticket_text_modules enable row level security;

grant select, insert, update, delete on public.ticket_tasks to authenticated;
grant select, insert, update, delete on public.ticket_links to authenticated;
grant select, insert, update, delete on public.ticket_macros to authenticated;
grant select, insert, update, delete on public.ticket_text_modules to authenticated;

/* Checklists follow their ticket; only agents tick them. */
drop policy if exists ticket_tasks_select on public.ticket_tasks;
create policy ticket_tasks_select on public.ticket_tasks
  for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_tasks.ticket_id));

drop policy if exists ticket_tasks_write on public.ticket_tasks;
create policy ticket_tasks_write on public.ticket_tasks
  for all to authenticated
  using (public.is_ticket_agent())
  with check (public.is_ticket_agent());

/* Links are visible with the ticket and written by agents. */
drop policy if exists ticket_links_select on public.ticket_links;
create policy ticket_links_select on public.ticket_links
  for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_links.ticket_id));

drop policy if exists ticket_links_write on public.ticket_links;
create policy ticket_links_write on public.ticket_links
  for all to authenticated
  using (public.is_ticket_agent())
  with check (public.is_ticket_agent());

/* Macros and text modules are read by agents, kept by IT. */
drop policy if exists ticket_macros_select on public.ticket_macros;
create policy ticket_macros_select on public.ticket_macros
  for select to authenticated using (public.is_ticket_agent());

drop policy if exists ticket_macros_write on public.ticket_macros;
create policy ticket_macros_write on public.ticket_macros
  for all to authenticated
  using (public.is_admin() or public.current_app_role() = 'it_manager')
  with check (public.is_admin() or public.current_app_role() = 'it_manager');

drop policy if exists ticket_text_modules_select on public.ticket_text_modules;
create policy ticket_text_modules_select on public.ticket_text_modules
  for select to authenticated using (public.is_ticket_agent());

drop policy if exists ticket_text_modules_write on public.ticket_text_modules;
create policy ticket_text_modules_write on public.ticket_text_modules
  for all to authenticated
  using (public.is_admin() or public.current_app_role() = 'it_manager')
  with check (public.is_admin() or public.current_app_role() = 'it_manager');

comment on table public.ticket_tasks is
  'Checklist inside one ticket (Zammad Checklist), phase 2 of the ticketing plan.';
comment on table public.ticket_macros is
  'One-click bundles of ticket changes (Zammad Macros).';
comment on table public.ticket_text_modules is
  'Reusable reply snippets (Zammad Text Modules), maintained in Masters.';
