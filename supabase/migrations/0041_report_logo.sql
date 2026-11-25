-- The logo printed on the exported patching report.
--
-- One row for the whole organisation. Settings administrators upload a PNG or a
-- JPEG; the patching report draws it in its header. With no row (or an empty
-- one) the report prints the TaskTornado wordmark that is drawn as vector paths
-- in the code, so the sheet never goes out bare.
--
-- The image lives here as base64 rather than in a public storage bucket: the
-- report is the only surface that shows it, and the file is a header graphic of
-- a few hundred kilobytes, which is exactly the size a row is good at.

create table if not exists public.app_branding (
  id text primary key,
  logo_mime text check (logo_mime is null or logo_mime in ('image/png', 'image/jpeg')),
  logo_base64 text,
  logo_name text not null default '',
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  -- A row is either a whole logo or nothing at all.
  constraint app_branding_complete check (
    (logo_mime is null and logo_base64 is null)
    or (logo_mime is not null and logo_base64 is not null)
  )
);

-- Settings administration, as the app defines it: the IT roles and Management,
-- plus the super admin. Mirrors `can(role, "settings", "admin")`.
create or replace function public.can_manage_branding()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_app_role() in ('super_admin','it_manager','it_engineer','management'), false);
$$;

comment on function public.can_manage_branding() is
  'True for the roles allowed to set the logo printed on exported reports.';

comment on table public.app_branding is
  'Organisation-wide branding for exports. Currently the patching report logo, stored as base64 with its mime type.';

alter table public.app_branding enable row level security;

/* Everyone signed in may read the logo — it is printed on a report any of them
   can download. Only Settings administrators write it. */
drop policy if exists app_branding_read on public.app_branding;
create policy app_branding_read on public.app_branding
  for select to authenticated using (true);

drop policy if exists app_branding_write on public.app_branding;
create policy app_branding_write on public.app_branding
  for all to authenticated
  using (public.can_manage_branding())
  with check (public.can_manage_branding());
