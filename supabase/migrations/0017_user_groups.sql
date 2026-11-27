-- Groups for the "Users & Groups" module. A group is a named collection of
-- employees, used to keep the directory organised by function. Only the hidden
-- super admin may read or write them; every policy checks the role in the
-- database, never the client.

create table if not exists public.user_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One group per name, case- and whitespace-insensitive.
create unique index if not exists user_groups_name_key
  on public.user_groups (lower(btrim(name)));

create table if not exists public.user_group_members (
  group_id uuid not null references public.user_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists user_group_members_user_idx
  on public.user_group_members (user_id);

alter table public.user_groups enable row level security;
alter table public.user_group_members enable row level security;

grant select, insert, update, delete on public.user_groups to authenticated;
grant select, insert, delete on public.user_group_members to authenticated;

drop policy if exists user_groups_super_admin on public.user_groups;
create policy user_groups_super_admin on public.user_groups
  for all
  to authenticated
  using (public.current_app_role() = 'super_admin')
  with check (public.current_app_role() = 'super_admin');

drop policy if exists user_group_members_super_admin on public.user_group_members;
create policy user_group_members_super_admin on public.user_group_members
  for all
  to authenticated
  using (public.current_app_role() = 'super_admin')
  with check (public.current_app_role() = 'super_admin');
