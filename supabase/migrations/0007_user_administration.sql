-- User administration for the hidden super admin: create, suspend, delete.
-- Every function checks the caller's role in the database; the app never
-- decides authorisation on its own.

-- 1. A profile can now express a suspension.
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('active', 'inactive', 'pending', 'suspended'));

-- 2. Create an employee: auth user + identity + profile, all in one call.
create or replace function public.admin_create_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_title text,
  p_role public.app_role
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

  if exists (select 1 from auth.users u where lower(u.email) = normalized) then
    raise exception 'An account already uses this email address.' using errcode = '23505';
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
    jsonb_build_object('full_name', display_name, 'title', coalesce(trim(p_title), ''), 'role', p_role::text),
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
  insert into public.profiles (id, email, full_name, title, role, status)
  values (uid, normalized, display_name, nullif(trim(p_title), ''), p_role, 'active')
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        title = excluded.title,
        role = excluded.role,
        status = 'active';

  return uid;
end $$;

revoke all on function public.admin_create_user(text, text, text, text, public.app_role) from public;
grant execute on function public.admin_create_user(text, text, text, text, public.app_role) to authenticated;

-- 3. Suspend / reactivate.
create or replace function public.admin_set_user_status(p_user uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_app_role() is distinct from 'super_admin' then
    raise exception 'Only a super admin can change user status.' using errcode = '42501';
  end if;

  if p_status not in ('active', 'suspended', 'inactive', 'pending') then
    raise exception 'Unknown status.' using errcode = '22023';
  end if;

  if exists (select 1 from public.profiles where id = p_user and role = 'super_admin') then
    raise exception 'The super admin account cannot be changed.' using errcode = '42501';
  end if;

  update public.profiles
     set status = p_status,
         updated_at = now()
   where id = p_user;

  if not found then
    raise exception 'That account no longer exists.' using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.admin_set_user_status(uuid, text) from public;
grant execute on function public.admin_set_user_status(uuid, text) to authenticated;

-- 4. Delete.
create or replace function public.admin_delete_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if public.current_app_role() is distinct from 'super_admin' then
    raise exception 'Only a super admin can delete users.' using errcode = '42501';
  end if;

  if p_user = auth.uid() then
    raise exception 'You cannot delete your own account.' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles where id = p_user and role = 'super_admin') then
    raise exception 'The super admin account cannot be deleted.' using errcode = '42501';
  end if;

  delete from auth.users where id = p_user;

  if not found then
    raise exception 'That account no longer exists.' using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;
