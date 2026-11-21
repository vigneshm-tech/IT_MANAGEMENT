-- Super admin: hidden role, directory access, and the first account.
-- Applied after 0004_super_admin_role.sql.

-- 1. Admins now include the platform role; the check stays behind a security
--    definer function so the policy does not recurse into public.profiles.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_app_role() in ('super_admin','it_manager','management'), false);
$$;

-- 2. Only the super admin may read other people's profiles.
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (public.current_app_role() = 'super_admin');

-- 3. Metadata can never mint a super admin: sign-ups that ask for the role are
--    downgraded to "no role", which blocks sign-in until IT assigns one.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  requested text := nullif(meta->>'role', '');
  resolved public.app_role := null;
begin
  if requested is not null
     and requested <> 'super_admin'
     and requested = any (enum_range(null::public.app_role)::text[]) then
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

-- 4. The first super admin. The email is confirmed so password sign-in works
--    immediately; rotate this password after the first login.
do $$
declare
  target_email text := 'vignesh11110@gmail.com';
  target_password text := 'Admin@123';
  uid uuid;
begin
  select id into uid from auth.users where email = target_email;

  if uid is null then
    uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000'::uuid,
      uid,
      'authenticated',
      'authenticated',
      target_email,
      crypt(target_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', 'Vignesh', 'title', 'Super Admin'),
      now(), now(), '', '', '', ''
    );
  else
    update auth.users
       set encrypted_password = crypt(target_password, gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at = now()
     where id = uid;
  end if;

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    uid,
    jsonb_build_object('sub', uid::text, 'email', target_email, 'email_verified', true),
    'email',
    target_email,
    now(), now(), now()
  )
  on conflict (provider, provider_id) do nothing;

  insert into public.profiles (id, email, full_name, title, role, status)
  values (uid, target_email, 'Vignesh', 'Super Admin', 'super_admin', 'active')
  on conflict (id) do update
    set role = 'super_admin',
        status = 'active',
        title = 'Super Admin',
        email = excluded.email;
end $$;
