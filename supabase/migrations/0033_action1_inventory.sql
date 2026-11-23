-- The server inventory, stored rather than fetched per page.
--
-- Action1 costs a token, an organisation lookup and up to four inventory pages,
-- so a cold Servers page could spend most of a minute waiting on somebody else's
-- API — and every module switch paid it again. This table holds one snapshot per
-- workspace, written by the nightly job (/api/servers/sync) or by "Sync now" and
-- read by everything that shows endpoints.
--
-- Stale is not broken: the reader reports the capture time and the nightly job
-- keeps it a day old at worst. A failed sync records `last_error` and leaves the
-- previous snapshot in place.

create table if not exists public.action1_inventory (
  scope text primary key default 'default',
  captured_at timestamptz not null default now(),
  duration_ms int,
  organization_id text not null default '',
  api_host text not null default '',
  total int not null default 0,
  truncated boolean not null default false,
  patch_data boolean not null default true,
  endpoints jsonb not null default '[]'::jsonb,
  source text not null default 'schedule' check (source in ('schedule', 'manual', 'inline')),
  last_error text,
  last_attempt_at timestamptz
);

alter table public.action1_inventory enable row level security;

/*
 * Readable by anyone signed in — the module guard decides who may look at the
 * page, and the endpoint list is organisation-wide by nature. No authenticated
 * writes: snapshots come from the job and the Sync button, both of which run
 * with the service role.
 */
drop policy if exists action1_inventory_read on public.action1_inventory;
create policy action1_inventory_read on public.action1_inventory
  for select to authenticated using (true);

comment on table public.action1_inventory is
  'Nightly Action1 endpoint snapshot. Written by /api/servers/sync and Sync now; read by every endpoint view.';
