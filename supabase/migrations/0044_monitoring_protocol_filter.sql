-- Which URLs Monitoring watches.
--
-- 'all' keeps the original behaviour (every published binding); 'https' watches
-- only the SSL-mapped bindings, 'http' only the plain ones. The filter is
-- applied when the IIS register is read, so nothing has to be maintained twice.
-- The allowed values match ProtocolFilter in lib/monitoring/core.ts.

alter table public.monitoring_settings
  add column if not exists protocol_filter text not null default 'all';

alter table public.monitoring_settings
  drop constraint if exists monitoring_settings_protocol_filter_check;

alter table public.monitoring_settings
  add constraint monitoring_settings_protocol_filter_check
  check (protocol_filter in ('all', 'https', 'http'));

comment on column public.monitoring_settings.protocol_filter is
  'Which binding schemes Monitoring probes: all, https only, or http only.';
