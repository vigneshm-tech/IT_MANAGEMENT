-- TaskTornado milestone 1 — roles, profiles, RLS helpers and audit log.
-- Applied to the IT_MANAGEMENT Supabase project (ref: cfzdnykihcajhwvqkybo).

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum (
      'it_manager','it_engineer',
      'l2_support_manager','l2_support_lead','l2_support_engineer',
      'implementation_manager','implementation_lead','implementation_engineer',
      'development_manager','development_lead','development_engineer',
      'testing_manager','testing_lead','testing_engineer',
      'management'
    );
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  title text,
  role public.app_role,
  status text not null default 'active' check (status in ('active','inactive','pending')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'TaskTornado employee profiles. role is the single source of truth for RBAC.';

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select to authenticated using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('it_manager','management')
    )
  );

create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_app_role() in ('it_manager','management'), false);
$$;

create or replace function public.is_leadership()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_app_role() in (
    'it_manager','l2_support_manager','l2_support_lead',
    'implementation_manager','implementation_lead',
    'development_manager','development_lead',
    'testing_manager','testing_lead','management'
  ), false);
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Every auth user gets a profile. The role is taken from user metadata and is
-- NULL when missing, which blocks sign-in until IT assigns one.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  requested text := nullif(meta->>'role', '');
  resolved public.app_role := null;
begin
  if requested is not null and requested = any (enum_range(null::public.app_role)::text[]) then
    resolved := requested::public.app_role;
  end if;

  insert into public.profiles (id, email, full_name, title, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(meta->>'full_name',''), split_part(coalesce(new.email,''), '@', 1)),
    nullif(meta->>'title',''),
    resolved
  )
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table if not exists public.audit_log (
  id bigserial primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  entity text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

drop policy if exists audit_insert_self on public.audit_log;
create policy audit_insert_self on public.audit_log
  for insert to authenticated with check (actor_id = auth.uid());

drop policy if exists audit_select_admin on public.audit_log;
create policy audit_select_admin on public.audit_log
  for select to authenticated using (public.is_admin());

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists audit_log_created_at_idx on public.audit_log(created_at desc);

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_leadership() to authenticated;
