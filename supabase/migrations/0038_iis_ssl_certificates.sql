-- IIS applications: say which certificate is mapped, not just that TLS is on.
--
-- "SSL mapped = true" answers half the question. The half that causes incidents
-- is *which* certificate: a wildcard that covers the host, a named one that
-- expired last week, or the wrong site's certificate bound by mistake. The
-- collector now reads the mapping out of IIS/HTTP.sys, so the register stores
-- the common name, the thumbprint and the expiry date beside the switch.

alter table public.iis_applications
  add column if not exists ssl_certificate text not null default '',
  add column if not exists ssl_thumbprint text not null default '',
  add column if not exists ssl_expires_at date;

comment on column public.iis_applications.ssl_certificate is
  'SSL certificate common name mapped to the binding, e.g. *.eshopaid.com.';
comment on column public.iis_applications.ssl_thumbprint is
  'Thumbprint of the mapped certificate — pins the exact certificate, not just its name.';
comment on column public.iis_applications.ssl_expires_at is
  'The day the mapped certificate expires.';

-- A certificate that has lapsed is the state worth finding in a list.
create index if not exists iis_applications_ssl_expiry_idx
  on public.iis_applications (ssl_expires_at)
  where ssl_expires_at is not null;
