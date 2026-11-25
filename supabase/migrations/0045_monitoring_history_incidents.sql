-- Monitoring, second pass: history, incidents, one round at a time, and the
-- settings the probe needs to be both faster and less noisy.
--
--   monitoring_history   one row per URL per round, 30 days kept (uptime/p95)
--   monitoring_incidents an outage with a start, an end and an acknowledgement
--   monitoring_rounds    a one-row lease so three open tabs run one round
--
-- Allowed values and bounds match lib/monitoring/core.ts and store.ts.

/* ---------------------------------------------------------------- checks --- */

alter table public.monitoring_checks
  add column if not exists escalated boolean not null default false;
alter table public.monitoring_checks
  add column if not exists cert_alerted boolean not null default false;
alter table public.monitoring_checks
  add column if not exists cert_expires_at timestamptz;
alter table public.monitoring_checks
  add column if not exists attempts integer not null default 1;
alter table public.monitoring_checks
  add column if not exists phases jsonb;

comment on column public.monitoring_checks.phases is
  'Where the first hop went: dns, tcp, tls and first-byte offsets in ms.';
comment on column public.monitoring_checks.cert_expires_at is
  'notAfter of the certificate the site presented, so expiry is a warning, not an outage.';

/* -------------------------------------------------------------- settings --- */

alter table public.monitoring_settings
  add column if not exists allow_insecure_tls boolean not null default false;
alter table public.monitoring_settings
  add column if not exists treat_auth_as_up boolean not null default false;
alter table public.monitoring_settings
  add column if not exists escalation_emails text[] not null default '{}'::text[];
alter table public.monitoring_settings
  add column if not exists escalate_after_minutes integer not null default 15;
alter table public.monitoring_settings
  add column if not exists webhook_url text not null default '';
alter table public.monitoring_settings
  add column if not exists maintenance_from timestamptz;
alter table public.monitoring_settings
  add column if not exists maintenance_to timestamptz;
alter table public.monitoring_settings
  add column if not exists maintenance_note text not null default '';
alter table public.monitoring_settings
  add column if not exists summary_token text not null default '';

alter table public.monitoring_settings
  drop constraint if exists monitoring_settings_escalate_after_check;
alter table public.monitoring_settings
  add constraint monitoring_settings_escalate_after_check
  check (escalate_after_minutes between 1 and 1440);

comment on column public.monitoring_settings.allow_insecure_tls is
  'Trust internal/self-signed certificates, for networks that inspect TLS.';
comment on column public.monitoring_settings.treat_auth_as_up is
  'Treat 401/403 as healthy, for sites behind Windows authentication.';
comment on column public.monitoring_settings.escalation_emails is
  'Second list, told when an outage outlasts escalate_after_minutes.';
comment on column public.monitoring_settings.maintenance_from is
  'Start of a declared window in which alerts are suppressed (probes continue).';
comment on column public.monitoring_settings.summary_token is
  'Bearer for the read-only /api/monitoring/summary endpoint; empty disables it.';

/* --------------------------------------------------------------- history --- */

create table if not exists public.monitoring_history (
  id bigserial primary key,
  target_key text not null,
  ok boolean not null,
  status_code integer,
  latency_ms integer,
  error text,
  checked_at timestamptz not null default now(),
  cert_expires_at timestamptz
);

create index if not exists monitoring_history_key_time
  on public.monitoring_history (target_key, checked_at desc);

comment on table public.monitoring_history is
  'One row per URL per round; trimmed to 30 days. Uptime and p95 are computed from it.';

/* ------------------------------------------------------------- incidents --- */

create table if not exists public.monitoring_incidents (
  id uuid primary key default gen_random_uuid(),
  target_key text not null,
  site text not null,
  url text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users (id) on delete set null,
  note text not null default ''
);

create index if not exists monitoring_incidents_key_time
  on public.monitoring_incidents (target_key, started_at desc);

comment on table public.monitoring_incidents is
  'An outage: opened on the way down, closed on the way back up, acknowledged with who and why.';

/* ---------------------------------------------------------------- rounds --- */

create table if not exists public.monitoring_rounds (
  id text primary key,
  started_at timestamptz not null default 'epoch'
);

comment on table public.monitoring_rounds is
  'A one-row lease: whoever moves started_at forward owns the next round.';

/* ---------------------------------------------------------------- access --- */

alter table public.monitoring_history enable row level security;
alter table public.monitoring_incidents enable row level security;
alter table public.monitoring_rounds enable row level security;

drop policy if exists monitoring_history_read on public.monitoring_history;
create policy monitoring_history_read on public.monitoring_history
  for select to authenticated using (true);

drop policy if exists monitoring_history_write on public.monitoring_history;
create policy monitoring_history_write on public.monitoring_history
  for insert to authenticated with check (true);

drop policy if exists monitoring_history_trim on public.monitoring_history;
create policy monitoring_history_trim on public.monitoring_history
  for delete to authenticated using (true);

drop policy if exists monitoring_incidents_read on public.monitoring_incidents;
create policy monitoring_incidents_read on public.monitoring_incidents
  for select to authenticated using (true);

drop policy if exists monitoring_incidents_write on public.monitoring_incidents;
create policy monitoring_incidents_write on public.monitoring_incidents
  for insert to authenticated with check (true);

drop policy if exists monitoring_incidents_update on public.monitoring_incidents;
create policy monitoring_incidents_update on public.monitoring_incidents
  for update to authenticated using (true) with check (true);

drop policy if exists monitoring_rounds_all on public.monitoring_rounds;
create policy monitoring_rounds_all on public.monitoring_rounds
  for all to authenticated using (true) with check (true);

/* ---------------------------------------------------------------- uptime --- */

create or replace function public.monitoring_uptime(keys text[], days integer)
returns table (
  target_key text,
  checks bigint,
  up_checks bigint,
  avg_latency numeric,
  p95_latency numeric,
  last_checked timestamptz
)
language sql stable security definer set search_path = public
as $$
  select
    h.target_key,
    count(*)::bigint as checks,
    count(*) filter (where h.ok)::bigint as up_checks,
    round(avg(h.latency_ms) filter (where h.ok))::numeric as avg_latency,
    percentile_cont(0.95) within group (order by h.latency_ms)
      filter (where h.ok and h.latency_ms is not null)::numeric as p95_latency,
    max(h.checked_at) as last_checked
  from public.monitoring_history h
  where h.target_key = any(keys)
    and h.checked_at >= now() - (greatest(days, 1) || ' days')::interval
  group by h.target_key;
$$;

comment on function public.monitoring_uptime(text[], integer) is
  'Per-URL checks, up checks, average and p95 latency over the last N days.';
