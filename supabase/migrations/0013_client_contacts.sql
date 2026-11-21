-- Client register, second pass: the module now captures both contacts, their
-- mobile numbers with a country code, and the person the account is assigned
-- to. Created/updated timestamps already exist (`created_at` default now(),
-- `updated_at` via touch_updated_at), so they stay untouched here.

alter table public.clients
  add column if not exists primary_contact_name text not null default '',
  add column if not exists primary_contact_email text not null default '',
  add column if not exists primary_mobile_country text not null default 'IN',
  add column if not exists primary_mobile text not null default '',
  add column if not exists secondary_contact_name text not null default '',
  add column if not exists secondary_contact_email text not null default '',
  add column if not exists secondary_mobile_country text not null default 'IN',
  add column if not exists secondary_mobile text not null default '',
  add column if not exists assigned_user_id uuid references auth.users(id) on delete set null,
  add column if not exists assigned_user_name text not null default '';

-- The single contact the first version stored becomes the primary contact.
update public.clients
   set primary_contact_name = contact_name,
       primary_contact_email = contact_email
 where primary_contact_name = ''
   and primary_contact_email = ''
   and (contact_name <> '' or contact_email <> '');

-- Legacy columns: nothing reads them any more.
alter table public.clients
  drop column if exists contact_name,
  drop column if exists contact_email;

-- Mobile numbers are digits only, so form and database agree on what is stored.
alter table public.clients
  drop constraint if exists clients_primary_mobile_digits;
alter table public.clients
  add constraint clients_primary_mobile_digits
  check (primary_mobile = '' or primary_mobile ~ '^[0-9]{6,15}$');

alter table public.clients
  drop constraint if exists clients_secondary_mobile_digits;
alter table public.clients
  add constraint clients_secondary_mobile_digits
  check (secondary_mobile = '' or secondary_mobile ~ '^[0-9]{6,15}$');

-- Country codes are ISO-3166 alpha-2 (the app's list in lib/countries.ts).
alter table public.clients
  drop constraint if exists clients_primary_mobile_country_code;
alter table public.clients
  add constraint clients_primary_mobile_country_code
  check (primary_mobile_country ~ '^[A-Z]{2}$');

alter table public.clients
  drop constraint if exists clients_secondary_mobile_country_code;
alter table public.clients
  add constraint clients_secondary_mobile_country_code
  check (secondary_mobile_country ~ '^[A-Z]{2}$');

create index if not exists clients_assigned_user_idx on public.clients(assigned_user_id);

comment on column public.clients.code is 'Short code / license code shown across the workspace.';
comment on column public.clients.primary_mobile is 'Digits only; the country code lives in primary_mobile_country.';

-- The client form needs to offer colleagues as assignees, but profiles are only
-- readable by the super admin. This narrow, security-definer lookup returns
-- names (no emails, no titles) for active staff so any client editor can assign
-- an account without widening the profiles policy.
create or replace function public.assignable_users()
returns table (id uuid, full_name text, role public.app_role)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         coalesce(nullif(p.full_name, ''), nullif(p.email, ''), 'Unnamed') as full_name,
         p.role
    from public.profiles p
   where p.status = 'active'
     and p.role is not null
     and p.role::text <> 'super_admin'
   order by 2;
$$;

revoke all on function public.assignable_users() from public;
grant execute on function public.assignable_users() to authenticated;

comment on function public.assignable_users() is
  'Assignee picker for the client register: active staff, names only.';
