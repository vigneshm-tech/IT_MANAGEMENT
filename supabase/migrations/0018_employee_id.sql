-- Employee ID on the profile, and an admin_create_user that takes it.
--
-- The add-user form collects Employee Name, Employee ID, Designation, Work
-- email, Access level, Access group and a temporary password. The group is a
-- `user_group_members` row written by the app after the account exists, so this
-- function only gains the employee id.

alter table public.profiles add column if not exists employee_id text;

-- One account per employee id, ignoring case and surrounding whitespace.
create unique index if not exists profiles_employee_id_key
  on public.profiles (upper(btrim(employee_id)))
  where employee_id is not null;

-- Replace the five-argument signature: keeping both would make the RPC
-- ambiguous for PostgREST.
drop function if exists public.admin_create_user(text, text, text, text, public.app_role);

create or replace function public.admin_create_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_title text,
  p_role public.app_role,
  p_employee_id text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  uid uuid := gen_random_uuid();
  normalized text := lower(trim(p_email));
  display_name text := coalesce(nullif(trim(p_full_name), ''), split_part(lower(trim(p_email)), '@', 1));
  employee text := nullif(trim(p_employee_id), '');
begin
  if public.current_app_role() is distinct from 'super_admin' then
    raise exception 'Only a super admin can add users.' using errcode = '42501';
  end if;

  if p_role = 'super_admin' then
    raise exception 'The super admin role cannot be assigned.' using errcode = '22023';
  end if;

  if normalized !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;

  if char_length(coalesce(p_password, '')) < 8 then
    raise exception 'The temporary password needs at least 8 characters.' using errcode = '22023';
  end if;

  if employee is null or char_length(employee) < 2 then
    raise exception 'Enter the employee ID.' using errcode = '22023';
  end if;

  if exists (select 1 from auth.users u where lower(u.email) = normalized) then
    raise exception 'An account already uses this email address.' using errcode = '23505';
  end if;

  if exists (select 1 from public.profiles p where upper(btrim(p.employee_id)) = upper(employee)) then
    raise exception 'An account already uses this employee ID.' using errcode = '23505';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000'::uuid,
    uid,
    'authenticated',
    'authenticated',
    normalized,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'full_name', display_name,
      'title', coalesce(trim(p_title), ''),
      'role', p_role::text,
      'employee_id', employee
    ),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    uid,
    jsonb_build_object('sub', uid::text, 'email', normalized, 'email_verified', true),
    'email',
    normalized,
    now(), now(), now()
  )
  on conflict (provider, provider_id) do nothing;

  -- handle_new_user already created the row from metadata; make it exact.
  insert into public.profiles (id, email, full_name, title, role, status, employee_id)
  values (uid, normalized, display_name, nullif(trim(p_title), ''), p_role, 'active', employee)
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        title = excluded.title,
        role = excluded.role,
        status = 'active',
        employee_id = excluded.employee_id;

  return uid;
end $$;

revoke all on function public.admin_create_user(text, text, text, text, public.app_role, text) from public;
grant execute on function public.admin_create_user(text, text, text, text, public.app_role, text) to authenticated;
