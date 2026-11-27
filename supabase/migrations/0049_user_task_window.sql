-- Per-user task enrolment window.
--
-- The add-user form can give one person the hours in which they may raise
-- tasks (say 07:00–13:00) instead of the office-hours rule the Tasks module
-- applies to everybody else. The window belongs to the Tasks module: the app
-- only offers and only honours it for an access level that can open Tasks, and
-- it can only narrow *when* somebody may raise a task — never what they may
-- see or do.
--
-- Stored as a time of day on the profile. Both columns are null, or both are
-- set and run forwards; a half-saved or backwards window is refused outright,
-- so a typo cannot leave somebody locked out with no explanation.

alter table public.profiles add column if not exists task_window_start time;
alter table public.profiles add column if not exists task_window_end time;

alter table public.profiles drop constraint if exists profiles_task_window_check;
alter table public.profiles
  add constraint profiles_task_window_check check (
    (task_window_start is null and task_window_end is null)
    or (
      task_window_start is not null
      and task_window_end is not null
      and task_window_start < task_window_end
    )
  );

-- Replace the six-argument signature: keeping both would make the RPC
-- ambiguous for PostgREST, exactly as 0018 replaced the five-argument one.
drop function if exists public.admin_create_user(text, text, text, text, public.app_role, text);
drop function if exists public.admin_create_user(
  text, text, text, text, public.app_role, text, time, time
);

create or replace function public.admin_create_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_title text,
  p_role public.app_role,
  p_employee_id text,
  p_task_window_start time default null,
  p_task_window_end time default null
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

  if (p_task_window_start is null) <> (p_task_window_end is null) then
    raise exception 'The task enrolment window needs both a start and an end time.' using errcode = '22023';
  end if;

  if p_task_window_start is not null and p_task_window_start >= p_task_window_end then
    raise exception 'The task enrolment window must end after it starts.' using errcode = '22023';
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
  insert into public.profiles (
    id, email, full_name, title, role, status, employee_id,
    task_window_start, task_window_end
  )
  values (
    uid, normalized, display_name, nullif(trim(p_title), ''), p_role, 'active', employee,
    p_task_window_start, p_task_window_end
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        title = excluded.title,
        role = excluded.role,
        status = 'active',
        employee_id = excluded.employee_id,
        task_window_start = excluded.task_window_start,
        task_window_end = excluded.task_window_end;

  return uid;
end $$;

revoke all on function public.admin_create_user(
  text, text, text, text, public.app_role, text, time, time
) from public;
grant execute on function public.admin_create_user(
  text, text, text, text, public.app_role, text, time, time
) to authenticated;
