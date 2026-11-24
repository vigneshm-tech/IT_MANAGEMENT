-- The client list Redmine already knows, captured into our own database.
--
-- Every ticket in the portal project carries a "Client-eShopaid" custom field
-- (id 112) whose value is written as "<Client> | <code> | <code>". The values
-- are free text on the Redmine side, so the only trustworthy source for them is
-- the tickets themselves — and scanning the whole project costs one API page per
-- hundred tickets, which is not something a page load may do.
--
-- So the scan runs when somebody presses **Sync now** (or a scheduled caller
-- asks for it), and its result is stored here. Every reader answers from these
-- two tables; nobody waits on Redmine to draw a client list.
--
-- `value` is the exact string Redmine stores, character for character: it is
-- what a future PUT has to send back, so it is never normalised.

create table if not exists public.redmine_clients (
  value text primary key,
  -- The readable half of `value` (the part before the first pipe).
  name text not null default '',
  -- The remaining segments — the short codes the client is known by.
  codes text[] not null default '{}'::text[],
  -- Tickets that carried the value in the last scan, and the newest of them.
  tickets integer not null default 0 check (tickets >= 0),
  issue_id integer,
  first_seen timestamptz not null default now(),
  last_synced_at timestamptz not null default now()
);

-- One row: how the last scan went. A failed attempt records `last_error` and
-- leaves the catalogue alone — a bad minute at Redmine must not empty a list
-- that was correct an hour ago.
create table if not exists public.redmine_client_sync (
  scope text primary key default 'default',
  project_id integer not null default 674,
  field_id integer not null default 112,
  scanned integer not null default 0 check (scanned >= 0),
  truncated boolean not null default false,
  synced_at timestamptz not null default now(),
  duration_ms integer,
  source text not null default 'manual' check (source in ('manual', 'scheduled', 'inline')),
  last_error text,
  last_attempt_at timestamptz
);

alter table public.redmine_clients enable row level security;
alter table public.redmine_client_sync enable row level security;

/*
 * The client list is organisation-wide: anyone who may open Tickets may read
 * it. No authenticated writes — the catalogue is written by the sync, which
 * runs with the service role after checking the caller's role.
 */
drop policy if exists redmine_clients_read on public.redmine_clients;
create policy redmine_clients_read on public.redmine_clients
  for select to authenticated using (true);

drop policy if exists redmine_client_sync_read on public.redmine_client_sync;
create policy redmine_client_sync_read on public.redmine_client_sync
  for select to authenticated using (true);

create index if not exists redmine_clients_name_idx
  on public.redmine_clients (lower(name));

comment on table public.redmine_clients is
  'Distinct Client-eShopaid values captured from Redmine tickets. Written by Sync now; read by the Redmine clients page.';
comment on table public.redmine_client_sync is
  'Outcome of the last Redmine client scan: project, tickets read, when it ran and why it failed.';
comment on column public.redmine_clients.value is
  'Exact custom-field value as Redmine stores it — send it back unchanged.';
