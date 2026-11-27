-- The Action1 credential belongs to the organisation, not to one profile.
--
-- Super Admin, IT Manager and IT Engineer may all write it; every signed-in
-- colleague may read the row so the Servers inventory works for whoever opens
-- the module. Only the ciphertext is readable — the secret is decrypted in the
-- app with AUTH_SECRET and never sent to the browser.
--
-- Redmine keys stay private to their owner: each portal reads the issues that
-- person is assigned.

create or replace function public.can_manage_action1()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_app_role() in ('super_admin','it_manager','it_engineer'), false);
$$;

comment on function public.can_manage_action1() is
  'True for the roles allowed to save the organisation Action1 API credentials.';

-- Read: the Action1 row is visible to any authenticated user, everything else
-- stays owner-only.
drop policy if exists user_integrations_select on public.user_integrations;
create policy user_integrations_select on public.user_integrations
  for select to authenticated
  using (user_id = auth.uid() or provider = 'action1');

-- Write: own Redmine rows, or the organisation Action1 row as one of the three
-- managing roles.
drop policy if exists user_integrations_insert on public.user_integrations;
create policy user_integrations_insert on public.user_integrations
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (provider <> 'action1' or public.can_manage_action1())
  );

drop policy if exists user_integrations_update on public.user_integrations;
create policy user_integrations_update on public.user_integrations
  for update to authenticated
  using (user_id = auth.uid() and (provider <> 'action1' or public.can_manage_action1()))
  with check (user_id = auth.uid() and (provider <> 'action1' or public.can_manage_action1()));

drop policy if exists user_integrations_delete on public.user_integrations;
create policy user_integrations_delete on public.user_integrations
  for delete to authenticated
  using (
    (provider = 'action1' and public.can_manage_action1())
    or (provider <> 'action1' and user_id = auth.uid())
  );

comment on table public.user_integrations is
  'Encrypted API credentials: per-user Redmine keys, plus one organisation-wide Action1 connection readable by all signed-in users and writable by Super Admin, IT Manager and IT Engineer.';
