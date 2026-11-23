-- IIS applications and databases.
--
-- Two registers behind one module, because they are the same conversation: which
-- web applications are running, on which host, against which database, and who
-- owns them. Action1 says whether a host is up; it cannot say that
-- "portal.example.com" is an IIS site on WEB01 whose app pool is stopped, or that
-- ORDERS_DB last backed up eleven days ago.
--
-- Both tables are registers, not integrations: a person maintains them, the app
-- guards who may write, and `active` retires a row without losing its history.

create table if not exists public.iis_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  server text not null default '',
  environment text not null default 'production'
    check (environment in ('production', 'staging', 'development', 'dr')),
  app_pool text not null default '',
  binding text not null default '',
  framework text not null default '',
  owner text not null default '',
  status text not null default 'running'
    check (status in ('running', 'stopped', 'degraded', 'maintenance')),
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists iis_applications_name_idx
  on public.iis_applications (lower(btrim(name)), lower(btrim(server)));

create table if not exists public.iis_databases (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  server text not null default '',
  engine text not null default 'sql_server'
    check (engine in ('sql_server', 'postgresql', 'mysql', 'oracle', 'other')),
  environment text not null default 'production'
    check (environment in ('production', 'staging', 'development', 'dr')),
  size_gb numeric(10, 2),
  recovery_model text not null default '',
  last_backup_at date,
  owner text not null default '',
  status text not null default 'online'
    check (status in ('online', 'offline', 'maintenance')),
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists iis_databases_name_idx
  on public.iis_databases (lower(btrim(name)), lower(btrim(server)));

alter table public.iis_applications enable row level security;
alter table public.iis_databases enable row level security;

-- Registers: readable and writable by any signed-in user, with the role check
-- enforced in the actions (`can(role, "iis", "edit")`) exactly as the other
-- registers do it. RLS here protects against a missing session, not a wrong role.
drop policy if exists iis_applications_rw on public.iis_applications;
create policy iis_applications_rw on public.iis_applications
  for all to authenticated using (true) with check (true);

drop policy if exists iis_databases_rw on public.iis_databases;
create policy iis_databases_rw on public.iis_databases
  for all to authenticated using (true) with check (true);

comment on table public.iis_applications is
  'IIS sites and applications: host, app pool, binding, owner, run state.';
comment on table public.iis_databases is
  'Database instances behind those applications: engine, host, size, last backup, owner.';
