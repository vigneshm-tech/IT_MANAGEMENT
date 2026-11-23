-- MySQL instances, as their own register.
--
-- The Database register tracks the schemas a team answers for. A MySQL server
-- is administered as a machine though: host, port, version and charset belong to
-- the instance, and "is it running / when did it last back up" is asked about the
-- server, not about one schema. So MySQL gets a submodule of its own rather than
-- a fourth engine value on somebody else's form.

create table if not exists public.iis_mysql_instances (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  host text not null default '',
  port int not null default 3306 check (port between 1 and 65535),
  version text not null default '',
  environment text not null default 'production'
    check (environment in ('production', 'staging', 'development', 'dr')),
  size_gb numeric(10, 2),
  charset text not null default '',
  last_backup_at date,
  owner text not null default '',
  status text not null default 'running'
    check (status in ('running', 'stopped', 'degraded', 'maintenance')),
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists iis_mysql_name_idx
  on public.iis_mysql_instances (lower(btrim(name)), lower(btrim(host)));

alter table public.iis_mysql_instances enable row level security;

-- Same rule as the other two registers: any signed-in reader, with the role
-- check enforced in the actions.
drop policy if exists iis_mysql_instances_rw on public.iis_mysql_instances;
create policy iis_mysql_instances_rw on public.iis_mysql_instances
  for all to authenticated using (true) with check (true);

comment on table public.iis_mysql_instances is
  'MySQL server instances: host, port, version, charset, size, last backup, owner, run state.';
