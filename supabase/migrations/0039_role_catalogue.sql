-- TaskTornado — roles become data.
--
-- Until now a role was a compile-time list: sixteen ids, hard-coded in
-- `lib/roles.ts`, mirrored by the `app_role` enum. A workspace could not say
-- "we have a warehouse supervisor" without a release.
--
-- Two tables and one function fix that:
--
--   access_roles          the role itself — name, description, group, badge
--   access_role_modules   one row per module the role may touch, and how far
--                         (none / read / write)
--
-- The enum stays, because it is what tasks, approvals, clients, renewals and
-- patch plans store as their owner. `admin_add_role_key()` extends it when a
-- workspace defines a role, so every existing policy and function keeps working
-- exactly as it did; nothing here rewrites the record tables.
--
-- A role with no rows in `access_role_modules` is left to the rules compiled
-- into the application, which is what makes this migration a no-op for a
-- workspace that never opens Settings → Roles.

-- ---------------------------------------------------------------- catalogue

create table if not exists public.access_roles (
  id text primary key,
  label text not null,
  description text not null default '',
  group_key text not null default 'custom',
  level text not null default 'engineer',
  accent text not null default '#94a3b8',
  hidden boolean not null default false,
  builtin boolean not null default false,
  unrestricted_task_creation boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_roles_id_format check (id ~ '^[a-z][a-z0-9_]{2,39}$'),
  constraint access_roles_level check (level in ('manager', 'lead', 'engineer', 'executive')),
  constraint access_roles_group check (
    group_key in ('platform', 'it', 'l2_support', 'implementation', 'development', 'testing', 'management', 'custom')
  ),
  constraint access_roles_super_admin_builtin check (id <> 'super_admin' or (builtin and hidden))
);

create table if not exists public.access_role_modules (
  role_id text not null references public.access_roles(id) on delete cascade,
  module_id text not null,
  access text not null,
  updated_at timestamptz not null default now(),
  primary key (role_id, module_id),
  constraint access_role_modules_level check (access in ('none', 'read', 'write')),
  constraint access_role_modules_module check (
    module_id in ('dashboard', 'tasks', 'tickets', 'kb', 'servers', 'iis', 'clients',
                  'patching', 'approvals', 'renewals', 'masters', 'settings', 'users')
  )
);

comment on table public.access_roles is
  'Every role the workspace recognises. Editable from Settings → Roles.';
comment on table public.access_role_modules is
  'Per-role module access. A missing row means the built-in rules still apply.';

-- ---------------------------------------------------------------- seed

insert into public.access_roles
  (id, label, description, group_key, level, accent, hidden, builtin, unrestricted_task_creation)
values
  ('super_admin', 'Super Admin', 'Hidden platform owner. Full access to every module plus the user directory.',
   'platform', 'executive', '#c6a96c', true, true, true),
  ('it_manager', 'IT Manager', 'Administers TaskTornado, infrastructure integrations and access. Unrestricted task creation.',
   'it', 'manager', '#a78bfa', false, true, true),
  ('it_engineer', 'IT Engineer', 'Handles servers, patching execution and endpoint tooling.',
   'it', 'engineer', '#7c5cff', false, true, false),
  ('l2_support_manager', 'L2 Support Manager', 'Owns support SLAs, escalations and team capacity.',
   'l2_support', 'manager', '#67e8f9', false, true, true),
  ('l2_support_lead', 'L2 Support Lead', 'Runs the support shift and approves escalations.',
   'l2_support', 'lead', '#22d3ee', false, true, true),
  ('l2_support_engineer', 'L2 Support Engineer', 'Works assigned tickets and customer issues.',
   'l2_support', 'engineer', '#06b6d4', false, true, false),
  ('implementation_manager', 'Implementation Manager', 'Owns delivery plans, client onboarding and rollout risk.',
   'implementation', 'manager', '#6ee7b7', false, true, true),
  ('implementation_lead', 'Implementation Lead', 'Coordinates implementation squads and client handovers.',
   'implementation', 'lead', '#34d399', false, true, true),
  ('implementation_engineer', 'Implementation Engineer', 'Executes deployment and configuration tasks.',
   'implementation', 'engineer', '#10b981', false, true, false),
  ('development_manager', 'Development Manager', 'Owns engineering roadmap and release commitments.',
   'development', 'manager', '#f9a8d4', false, true, true),
  ('development_lead', 'Development Lead', 'Guides code delivery and reviews change requests.',
   'development', 'lead', '#f472b6', false, true, true),
  ('development_engineer', 'Development Engineer', 'Builds features and fixes defects.',
   'development', 'engineer', '#ec4899', false, true, false),
  ('testing_manager', 'Testing Manager', 'Owns quality strategy, coverage and release sign-off.',
   'testing', 'manager', '#fcd34d', false, true, true),
  ('testing_lead', 'Testing Lead', 'Plans test cycles and approves defect closures.',
   'testing', 'lead', '#fbbf24', false, true, true),
  ('testing_engineer', 'Testing Engineer', 'Executes test cases and logs defects.',
   'testing', 'engineer', '#f59e0b', false, true, false),
  ('management', 'Management', 'Read-only oversight across delivery, support and IT.',
   'management', 'executive', '#cbd5e1', false, true, true)
on conflict (id) do update
  set label = excluded.label,
      description = excluded.description,
      group_key = excluded.group_key,
      level = excluded.level,
      accent = excluded.accent,
      hidden = excluded.hidden,
      builtin = excluded.builtin,
      unrestricted_task_creation = excluded.unrestricted_task_creation
  where public.access_roles.builtin;

-- ---------------------------------------------------------------- RLS

alter table public.access_roles enable row level security;
alter table public.access_role_modules enable row level security;

drop policy if exists "access_roles readable by signed-in staff" on public.access_roles;
create policy "access_roles readable by signed-in staff"
  on public.access_roles for select
  to authenticated
  using (true);

drop policy if exists "access_role_modules readable by signed-in staff" on public.access_role_modules;
create policy "access_role_modules readable by signed-in staff"
  on public.access_role_modules for select
  to authenticated
  using (true);

drop policy if exists "access_roles writable by administrators" on public.access_roles;
create policy "access_roles writable by administrators"
  on public.access_roles for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "access_role_modules writable by administrators" on public.access_role_modules;
create policy "access_role_modules writable by administrators"
  on public.access_role_modules for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------- enum growth

/**
 * Teach the `app_role` enum a key this workspace just invented.
 *
 * Record tables store a role as the enum, so a workspace-defined role has to
 * exist there before anybody can hold it or own work with it. Values can be
 * added but never removed — which is why deleting a role only removes it from
 * the catalogue and leaves the enum as the harmless history of a name.
 */
create or replace function public.admin_add_role_key(p_role text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Called from the application with the server key (the role catalogue is
  -- workspace configuration, read and written outside any one person's session)
  -- or, if no server key is configured, by an administrator's own session.
  if current_user not in ('service_role', 'postgres') and not public.is_admin() then
    raise exception 'Only an administrator can define roles.' using errcode = '42501';
  end if;

  if p_role is null or p_role !~ '^[a-z][a-z0-9_]{2,39}$' then
    raise exception 'A role key must be lowercase letters, digits and underscores.' using errcode = '22023';
  end if;

  if p_role = 'super_admin' then
    raise exception 'That role key is reserved.' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typname = 'app_role' and e.enumlabel = p_role
  ) then
    execute format('alter type public.app_role add value %L', p_role);
  end if;
end $$;

comment on function public.admin_add_role_key(text) is
  'Extends the app_role enum so a workspace-defined role can be assigned or own work.';

grant execute on function public.admin_add_role_key(text) to authenticated;
