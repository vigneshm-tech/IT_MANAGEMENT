-- Per-user integration credentials. The secret is encrypted in the app with
-- AES-256-GCM (key derived from AUTH_SECRET) before it reaches Postgres; the
-- table only ever holds ciphertext plus a hint for masking.

create table if not exists public.user_integrations (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('redmine','action1')),
  base_url text not null default '',
  secret_ciphertext text not null,
  secret_hint text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.user_integrations enable row level security;

drop policy if exists user_integrations_select on public.user_integrations;
create policy user_integrations_select on public.user_integrations
  for select to authenticated using (user_id = auth.uid());

drop policy if exists user_integrations_insert on public.user_integrations;
create policy user_integrations_insert on public.user_integrations
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists user_integrations_update on public.user_integrations;
create policy user_integrations_update on public.user_integrations
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_integrations_delete on public.user_integrations;
create policy user_integrations_delete on public.user_integrations
  for delete to authenticated using (user_id = auth.uid());

drop trigger if exists user_integrations_touch_updated_at on public.user_integrations;
create trigger user_integrations_touch_updated_at
  before update on public.user_integrations
  for each row execute function public.touch_updated_at();

comment on table public.user_integrations is 'Encrypted per-user API credentials for external systems (Redmine, Action1).';
