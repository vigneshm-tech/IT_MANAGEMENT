-- Settings, phase 1: API keys.
--
-- A key is how a machine proves it is somebody: an integration, a script, or an
-- MCP client. Two rules shape the table.
--
--   * The secret is never stored. Only an HMAC-SHA-256 of the whole key, keyed
--     with AUTH_SECRET, is kept — so a database dump cannot be replayed, and a
--     leaked row is not a leaked credential.
--   * A key acts as the person who issued it. `user_id` is the authority: every
--     scope a request carries is re-checked against that profile's role, so a
--     key can never do more than its owner could do in the browser.
--
-- The prefix is stored in the clear because lookup needs it: a request presents
-- the secret, the route finds the row by prefix, then compares the hash.
--
-- Mirrors docs/api-and-mcp-plan.md.

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  -- `tt_` plus 8 characters of the secret: enough to find the row, useless as a key.
  prefix text not null unique check (prefix like 'tt\_%'),
  secret_hash text not null,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);

create index if not exists api_keys_user_idx
  on public.api_keys (user_id, created_at desc);

alter table public.api_keys enable row level security;

/*
 * A key belongs to the person who made it. There is no organisation-wide key in
 * phase 1 — an integration that must outlive an employee gets its own service
 * profile instead of borrowing someone else's credential.
 */
drop policy if exists api_keys_own_select on public.api_keys;
create policy api_keys_own_select on public.api_keys
  for select to authenticated using (user_id = auth.uid());

drop policy if exists api_keys_own_write on public.api_keys;
create policy api_keys_own_write on public.api_keys
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

/*
 * Column grants, not just row policies: the owner may read everything about
 * their key except the hash, and may only ever change the label, the scopes,
 * the expiry and the revocation stamp. `secret_hash` and `prefix` are written
 * once, at creation, and never updated.
 */
revoke all on public.api_keys from authenticated;
grant select (id, user_id, name, prefix, scopes, created_at, last_used_at, expires_at, revoked_at)
  on public.api_keys to authenticated;
grant insert (user_id, name, prefix, secret_hash, scopes, expires_at)
  on public.api_keys to authenticated;
grant update (name, scopes, expires_at, revoked_at, last_used_at)
  on public.api_keys to authenticated;
grant delete on public.api_keys to authenticated;

comment on table public.api_keys is
  'Personal API keys for /api/v1 and the MCP endpoint. Only an HMAC of the secret is stored.';
comment on column public.api_keys.prefix is
  'Cleartext lookup handle (tt_ + 8 chars). Not usable as a credential.';
comment on column public.api_keys.secret_hash is
  'HMAC-SHA-256 of the full key, keyed with AUTH_SECRET. Never returned to a client.';
comment on column public.api_keys.scopes is
  'Requested scopes; every use is also checked against the owner role, so a key cannot exceed its owner.';
