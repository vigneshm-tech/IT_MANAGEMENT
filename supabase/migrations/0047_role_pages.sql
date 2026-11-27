-- Access inside a module, page by page.
--
-- A role is granted a module (access_role_modules), and now, inside that module,
-- whichever of its pages an administrator has moved off "same as module". Only
-- overrides are stored: an absent key follows the module, so a workspace that
-- never opens the page list behaves exactly as it did before this column.
--
-- The value is `{"settings/email":"none","settings/profile":"allow"}` — a page
-- key and one of two answers. `none` closes a page even when the module is open;
-- `allow` is written whenever an administrator reopens one, so the grid can show
-- what was decided rather than what was left alone. A page can only narrow its
-- module; the module gate is applied in `canAccessPage()`.

alter table public.access_roles
  add column if not exists pages jsonb not null default '{}'::jsonb;

comment on column public.access_roles.pages is
  'Page-level access inside a module: {"<module>/<page>": "allow" | "none"}. An absent key follows the module.';

-- Keep the column to the shape the app writes, so a hand-edited row cannot
-- smuggle in something the grid would have to guess at.
alter table public.access_roles
  drop constraint if exists access_roles_pages_object;

alter table public.access_roles
  add constraint access_roles_pages_object check (jsonb_typeof(pages) = 'object');
