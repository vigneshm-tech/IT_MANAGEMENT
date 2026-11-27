-- IIS applications: the eight fields a Windows server can report.
--
-- The first shape kept one free-text `binding` and a `framework` string. A
-- person typing them could write anything, and the collector could not fill them
-- in honestly: the host header, the port and whether the binding speaks TLS are
-- three separate facts, and "framework" is not one of the eight things the
-- register asks for. This migration replaces the pair with the real fields,
-- backfills what the old string already said, and then drops it.

alter table public.iis_applications
  add column if not exists binding_host text not null default '',
  add column if not exists binding_port integer,
  add column if not exists ssl_mapped boolean not null default false,
  add column if not exists directory_browsing text not null default 'disabled',
  add column if not exists app_root text not null default '';

-- "https://portal.example.com:8443/x" → host portal.example.com, port 8443, ssl.
update public.iis_applications as app
set
  binding_host = regexp_replace(
    regexp_replace(btrim(app.binding), '^[A-Za-z][A-Za-z0-9+.-]*://', ''),
    '[:/?#].*$',
    ''
  ),
  binding_port = case
    when btrim(app.binding) ~ ':[0-9]{1,5}([/?#]|$)'
      then substring(btrim(app.binding) from ':([0-9]{1,5})([/?#]|$)')::integer
    when btrim(app.binding) ~* '^https://' then 443
    when btrim(app.binding) ~* '^http://' then 80
    else null
  end,
  ssl_mapped = btrim(app.binding) ~* '^https://'
where btrim(app.binding) <> '';

-- The two values the register allows, enforced where the data lives.
alter table public.iis_applications
  drop constraint if exists iis_applications_binding_port_check,
  drop constraint if exists iis_applications_directory_browsing_check;

alter table public.iis_applications
  add constraint iis_applications_binding_port_check
    check (binding_port is null or binding_port between 1 and 65535),
  add constraint iis_applications_directory_browsing_check
    check (directory_browsing in ('disabled', 'enabled'));

-- Retired: the free-text binding and the runtime string. Nothing reads them now.
alter table public.iis_applications
  drop column if exists binding,
  drop column if exists framework;

comment on column public.iis_applications.server is
  'Server Host Name — the Windows machine the site runs on.';
comment on column public.iis_applications.binding_host is
  'Binding Host Name — the host header, blank when the binding serves any host.';
comment on column public.iis_applications.binding_port is
  'Binding Port — 80, 443, 8080; null when the server did not report one.';
comment on column public.iis_applications.ssl_mapped is
  'SSL Mapped — the binding''s protocol is https.';
comment on column public.iis_applications.directory_browsing is
  'Directory Browsing — enabled or disabled on the application.';
comment on column public.iis_applications.app_root is
  'Application Root Path — the physical path on disk.';

comment on table public.iis_applications is
  'IIS sites and applications: server, binding host/port, SSL, app pool, directory browsing, root path, owner, run state.';
