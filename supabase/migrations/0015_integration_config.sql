-- Non-secret connection settings that belong with a stored credential.
--
-- Action1 authenticates with OAuth 2.0 client credentials, so the vault needs
-- the client id (and, optionally, the organization id) next to the encrypted
-- client secret. They are not secrets, so they live in a plain JSON column and
-- can be prefilled into the Settings form.
alter table public.user_integrations
  add column if not exists config jsonb not null default '{}'::jsonb;

comment on column public.user_integrations.config is
  'Non-secret settings stored with the credential (Action1 client id and organization id, for example).';
