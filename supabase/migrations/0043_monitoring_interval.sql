-- The check interval, in seconds.
--
-- Monitoring used to probe on a fixed cadence; the IT Manager can now say how
-- often, so the number lives with the alert recipients it is configured beside.
-- The bounds match lib/monitoring/core.ts: ten seconds is as fast as a round
-- should be asked to run, an hour as slow as still counts as monitoring.

alter table public.monitoring_settings
  add column if not exists interval_seconds integer not null default 60;

alter table public.monitoring_settings
  drop constraint if exists monitoring_settings_interval_seconds_check;

alter table public.monitoring_settings
  add constraint monitoring_settings_interval_seconds_check
  check (interval_seconds between 10 and 3600);

comment on column public.monitoring_settings.interval_seconds is
  'How often the Monitoring board probes each URL by itself, in seconds (10–3600).';
