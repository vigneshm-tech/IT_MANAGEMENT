-- Monitoring: whether the URLs IIS publishes are answering, who hears about it
-- when they are not, and the mail server that says so.
--
-- The list if URLs is not stored here. It is derived from the IIS register on
-- every run, so a binding added or retired in IIS is watched or forgotten
-- without a second list to keep in step. What is stored is the last answer for
-- each one — the board, and the memory that lets a change be spotted.

create table if not exists public.monitoring_checks (
  target_key text primary key,
  ok boolean not null,
  status_code integer,
  latency_ms integer,
  error text,
  checked_at timestamptz not null default now(),
  -- When the current state (up or down) began, so the page can say "down for 12 minutes".
  since timestamptz not null default now(),
  -- True once a down alert has been emailed for this outage. Cleared by recovery,
  -- which is what stops an hour-long outage sending sixty mails.
  alerted boolean not null default false
);

create table if not exists public.monitoring_settings (
  id text primary key default 'default',
  recipient_emails text[] not null default '{}'::text[],
  alerts_enabled boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.monitoring_settings (id) values ('default') on conflict (id) do nothing;

-- The workspace's outgoing mail server. One row, written by Settings
-- administrators. The password is AES-256-GCM ciphertext (key derived from
-- AUTH_SECRET) exactly like the Action1 key, so a dump of this table without the
-- environment secret gives up nothing.
create table if not exists public.app_email_settings (
  id text primary key default 'default',
  host text not null default '',
  port integer not null default 587 check (port between 1 and 65535),
  tls text not null default 'starttls' check (tls in ('starttls', 'tls', 'none')),
  username text not null default '',
  password_ciphertext text,
  password_hint text,
  from_address text not null default '',
  from_name text not null default '',
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.app_email_settings (id) values ('default') on conflict (id) do nothing;

/* Monitoring is configured by the IT Manager (and the super admin, who holds
   every capability). */
create or replace function public.can_manage_monitoring()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_app_role() in ('super_admin','it_manager'), false);
$$;

/* Settings administration, as the app defines it. */
create or replace function public.can_manage_email_settings()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_app_role() in ('super_admin','it_manager','it_engineer','management'), false);
$$;

comment on function public.can_manage_monitoring() is
  'True for the roles allowed to set Monitoring alert recipients.';
comment on function public.can_manage_email_settings() is
  'True for the roles allowed to save the SMTP settings.';
comment on table public.monitoring_checks is
  'The last answer from each monitored IIS URL: up or down, status, latency, and when that state began.';
comment on table public.monitoring_settings is
  'Who receives Monitoring alerts, and whether they are sent.';
comment on table public.app_email_settings is
  'The SMTP account Monitoring alerts are sent from. Password stored encrypted, like the integration vault.';

alter table public.monitoring_checks enable row level security;
alter table public.monitoring_settings enable row level security;
alter table public.app_email_settings enable row level security;

/*
 * Checks are written by whoever is looking at the board, so every signed-in user
 * may maintain them. They hold nothing but a probe result.
 */
drop policy if exists monitoring_checks_read on public.monitoring_checks;
create policy monitoring_checks_read on public.monitoring_checks
  for select to authenticated using (true);

drop policy if exists monitoring_checks_write on public.monitoring_checks;
create policy monitoring_checks_write on public.monitoring_checks
  for insert to authenticated with check (true);

drop policy if exists monitoring_checks_update on public.monitoring_checks;
create policy monitoring_checks_update on public.monitoring_checks
  for update to authenticated using (true) with check (true);

/* Recipients: readable so the page can say who is told; written by IT only. */
drop policy if exists monitoring_settings_read on public.monitoring_settings;
create policy monitoring_settings_read on public.monitoring_settings
  for select to authenticated using (true);

drop policy if exists monitoring_settings_write on public.monitoring_settings;
create policy monitoring_settings_write on public.monitoring_settings
  for all to authenticated
  using (public.can_manage_monitoring())
  with check (public.can_manage_monitoring());

/* SMTP: the row is readable so the monitoring check can send mail while any
   signed-in person has the board open — the password in it is ciphertext. */
drop policy if exists app_email_settings_read on public.app_email_settings;
create policy app_email_settings_read on public.app_email_settings
  for select to authenticated using (true);

drop policy if exists app_email_settings_write on public.app_email_settings;
create policy app_email_settings_write on public.app_email_settings
  for all to authenticated
  using (public.can_manage_email_settings())
  with check (public.can_manage_email_settings());
