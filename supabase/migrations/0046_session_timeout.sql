-- How long a sign-in lasts.
--
-- One row for the whole workspace, set under Settings → Security & sessions.
-- `timeout_minutes = 0` means until sign out; anything else is minutes. The
-- choice is applied when a session is issued, so it governs the next sign-in
-- rather than expiring people who are in the middle of something.
--
-- Defaults to 12 hours, which is what the app did before this table existed.

create table if not exists public.app_session_policy (
  id text primary key,
  timeout_minutes integer not null default 720
    check (timeout_minutes >= 0 and timeout_minutes <= 525600),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.app_session_policy is
  'The workspace login timeout: minutes, or 0 for "until sign out". Applied when a session is issued.';

-- Only the IT Manager and the super admin may change it, whatever the module
-- matrix says; everyone signed in may read it (the security page shows it).
create or replace function public.can_manage_session_policy()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_app_role() in ('super_admin','it_manager'), false);
$$;

comment on function public.can_manage_session_policy() is
  'True for the roles allowed to change the workspace login timeout.';

alter table public.app_session_policy enable row level security;

drop policy if exists app_session_policy_read on public.app_session_policy;
create policy app_session_policy_read on public.app_session_policy
  for select to authenticated using (true);

/* Sign-in happens before there is a session to read with, so the number has to
   be visible to `anon` too. It is one timeout, not a secret; the write policy
   above still keeps everyone else out. */
drop policy if exists app_session_policy_read_anon on public.app_session_policy;
create policy app_session_policy_read_anon on public.app_session_policy
  for select to anon using (true);

drop policy if exists app_session_policy_write on public.app_session_policy;
create policy app_session_policy_write on public.app_session_policy
  for all to authenticated
  using (public.can_manage_session_policy())
  with check (public.can_manage_session_policy());

insert into public.app_session_policy (id, timeout_minutes)
values ('session', 720)
on conflict (id) do nothing;
