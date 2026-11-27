-- Settings, phase 2: OAuth for the MCP endpoint.
--
-- The MCP endpoint already accepts a personal API key in an `Authorization`
-- header. That works for clients that let you set a header — Claude Code,
-- `mcp-remote`, Cursor, VS Code. It does not work for the connector screens that
-- only know how to follow OAuth, which is why "the server was added but no tools
-- loaded": the client was handed a 401 and had nowhere to send a key.
--
-- So the server now speaks OAuth 2.1, and a key remains the alternative:
--
--   * dynamic client registration (RFC 7591) — the client introduces itself,
--   * authorization code + PKCE (S256 only), consenting on the signed-in session,
--   * short-lived access tokens with rotating refresh tokens.
--
-- Nothing here widens the permission model. The scopes a client is granted at
-- consent are the ones the person's role already holds; every request re-checks
-- them against the role, exactly as a key's scopes are checked.

create table if not exists public.mcp_oauth_clients (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,
  client_name text not null,
  redirect_uris text[] not null,
  -- Null for public clients (the usual case for an MCP client); set for the
  -- confidential ones that ask for it. Either way only the hash is stored.
  client_secret_hash text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists public.mcp_oauth_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  client_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists mcp_oauth_codes_expiry_idx on public.mcp_oauth_codes (expires_at);

create table if not exists public.mcp_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  kind text not null check (kind in ('access', 'refresh')),
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id text not null,
  client_name text not null,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists mcp_oauth_tokens_user_idx
  on public.mcp_oauth_tokens (user_id, created_at desc);

/*
 * Clients and codes are the authorisation server's private bookkeeping: no
 * session may read them, so RLS is on with no policies at all and only the
 * service role (which bypasses RLS) can touch them.
 */
alter table public.mcp_oauth_clients enable row level security;
alter table public.mcp_oauth_codes enable row level security;

/*
 * Tokens are different: a person must be able to see and revoke the apps acting
 * as them. They may read their own rows — never the hash — and may only set
 * `revoked_at`.
 */
alter table public.mcp_oauth_tokens enable row level security;

drop policy if exists mcp_oauth_tokens_own_select on public.mcp_oauth_tokens;
create policy mcp_oauth_tokens_own_select on public.mcp_oauth_tokens
  for select to authenticated using (user_id = auth.uid());

drop policy if exists mcp_oauth_tokens_own_update on public.mcp_oauth_tokens;
create policy mcp_oauth_tokens_own_update on public.mcp_oauth_tokens
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.mcp_oauth_tokens from authenticated;
grant select (id, kind, user_id, client_id, client_name, scopes, created_at, last_used_at, expires_at, revoked_at)
  on public.mcp_oauth_tokens to authenticated;
grant update (revoked_at) on public.mcp_oauth_tokens to authenticated;

comment on table public.mcp_oauth_clients is
  'MCP clients registered through dynamic client registration (RFC 7591).';
comment on table public.mcp_oauth_codes is
  'Single-use authorisation codes (PKCE S256). Rows expire in ten minutes.';
comment on table public.mcp_oauth_tokens is
  'Access and refresh tokens for the MCP endpoint. Only an HMAC of each token is stored.';
