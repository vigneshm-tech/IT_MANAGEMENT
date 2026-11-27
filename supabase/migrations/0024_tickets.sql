-- Native ticketing, phase 1.
--
-- The tickets module used to proxy Redmine. This is the module's own data:
-- a ticket with its own number, state, priority and queue, plus the articles
-- (messages) that make up its history.
--
-- Deliberate snapshot columns: `queue_name`, `owner_name`, `requester_name`.
-- A ticket must still read correctly after a queue is renamed or a person
-- leaves, so the row keeps its own copy and never depends on a join.

create sequence if not exists public.ticket_number_seq start with 1001;

/* -------------------------------------------------------------------------- */
/*  Queues (the Zammad "Groups" equivalent)                                   */
/* -------------------------------------------------------------------------- */

create table if not exists public.ticket_queues (
  id text primary key,
  name text not null,
  description text not null default '',
  sort_order integer not null default 100,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now()
);

create unique index if not exists ticket_queues_name_key
  on public.ticket_queues (lower(btrim(name)));

insert into public.ticket_queues (id, name, description, sort_order) values
  ('service-desk',  'Service desk',   'Everyday requests, access and how-to questions', 10),
  ('infrastructure','Infrastructure', 'Servers, network, endpoints and patching',       20),
  ('applications',  'Applications',   'Business applications and integrations',         30),
  ('security',      'Security',       'Incidents, phishing reports and access reviews', 40)
on conflict (id) do nothing;

/* -------------------------------------------------------------------------- */
/*  Tickets                                                                   */
/* -------------------------------------------------------------------------- */

create table if not exists public.tickets (
  id text primary key default ('TT-' || nextval('public.ticket_number_seq')),
  subject text not null check (char_length(subject) between 4 and 160),
  state text not null default 'new' check (state in ('new','open','pending','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  queue_id text references public.ticket_queues(id) on delete set null,
  queue_name text not null default '',
  owner_id uuid references public.profiles(id) on delete set null,
  owner_name text not null default '',
  requester_id uuid references public.profiles(id) on delete set null,
  requester_name text not null default '',
  requester_email text not null default '',
  channel text not null default 'web' check (channel in ('web','email','phone','chat')),
  tags text[] not null default '{}',
  due_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_articles (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null references public.tickets(id) on delete cascade,
  kind text not null default 'web' check (kind in ('web','note','system','email','phone')),
  internal boolean not null default false,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null default '',
  author_role text not null default '',
  body text not null check (char_length(body) between 1 and 8000),
  time_minutes integer not null default 0 check (time_minutes between 0 and 1440),
  created_at timestamptz not null default now()
);

create index if not exists tickets_state_idx on public.tickets (state);
create index if not exists tickets_owner_idx on public.tickets (owner_id);
create index if not exists tickets_queue_idx on public.tickets (queue_id);
create index if not exists tickets_updated_idx on public.tickets (updated_at desc);
create index if not exists ticket_articles_ticket_idx
  on public.ticket_articles (ticket_id, created_at);

alter table public.ticket_queues enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_articles enable row level security;

grant select, insert, update, delete on public.ticket_queues to authenticated;
grant select, insert, update, delete on public.tickets to authenticated;
grant select, insert, update, delete on public.ticket_articles to authenticated;
grant usage, select on sequence public.ticket_number_seq to authenticated;

/* Queues: everyone reads the list; IT and the platform owner maintain it. */
drop policy if exists ticket_queues_select on public.ticket_queues;
create policy ticket_queues_select on public.ticket_queues
  for select to authenticated using (true);

drop policy if exists ticket_queues_write on public.ticket_queues;
create policy ticket_queues_write on public.ticket_queues
  for all to authenticated
  using (public.is_admin() or public.current_app_role() = 'it_manager')
  with check (public.is_admin() or public.current_app_role() = 'it_manager');

/*
 * Tickets: agents (IT, L2 support and leadership) see the whole board; everyone
 * else sees the tickets they raised or own. That is the row-level half of the
 * rule; the app hides internal notes from non-agents on top of it.
 */
drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets
  for select to authenticated
  using (
    public.current_app_role() in (
      'super_admin','it_manager','it_engineer',
      'l2_support_manager','l2_support_lead','l2_support_engineer',
      'management'
    )
    or requester_id = auth.uid()
    or owner_id = auth.uid()
  );

drop policy if exists tickets_insert_self on public.tickets;
create policy tickets_insert_self on public.tickets
  for insert to authenticated
  with check (requester_id = auth.uid());

drop policy if exists tickets_update_agents on public.tickets;
create policy tickets_update_agents on public.tickets
  for update to authenticated
  using (
    public.current_app_role() in (
      'super_admin','it_manager','it_engineer',
      'l2_support_manager','l2_support_lead','l2_support_engineer',
      'management'
    )
    or requester_id = auth.uid()
  )
  with check (
    public.current_app_role() in (
      'super_admin','it_manager','it_engineer',
      'l2_support_manager','l2_support_lead','l2_support_engineer',
      'management'
    )
    or requester_id = auth.uid()
  );

drop policy if exists tickets_delete_admin on public.tickets;
create policy tickets_delete_admin on public.tickets
  for delete to authenticated using (public.is_admin());

/* Articles follow their ticket. */
drop policy if exists ticket_articles_select on public.ticket_articles;
create policy ticket_articles_select on public.ticket_articles
  for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_articles.ticket_id));

drop policy if exists ticket_articles_insert on public.ticket_articles;
create policy ticket_articles_insert on public.ticket_articles
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.tickets t where t.id = ticket_articles.ticket_id)
  );

drop policy if exists ticket_articles_delete_admin on public.ticket_articles;
create policy ticket_articles_delete_admin on public.ticket_articles
  for delete to authenticated using (public.is_admin());

drop trigger if exists tickets_touch_updated_at on public.tickets;
create trigger tickets_touch_updated_at
  before update on public.tickets
  for each row execute function public.touch_updated_at();

comment on table public.tickets is
  'Native tickets. Phase 1 of the Zammad-parity plan in docs/ticketing-plan.md.';
comment on table public.ticket_articles is
  'One row per ticket message; `note`/`system` rows are internal.';
