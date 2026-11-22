-- The last missing piece of the MCP story: what the client actually said.
--
-- "No tools loaded" and "connection failed" are the same sentence to a user and
-- two very different things to a server. This table records the verb, the
-- JSON-RPC method, the protocol version the client claimed, the status we
-- answered and one line of detail — enough to tell a bad credential from a bad
-- handshake from a tool that failed. It holds no secrets: `credential` is the
-- credential *kind* and key prefix, never the value.
--
-- Written best-effort on every MCP request and read by Settings → Developers, so
-- a person can see their own connector's attempts without asking anyone.

create table if not exists public.mcp_requests (
  id bigserial primary key,
  at timestamptz not null default now(),
  verb text not null,
  rpc_method text,
  status int not null,
  protocol_version text,
  accept text,
  user_agent text,
  credential text,
  detail text
);

create index if not exists mcp_requests_at_idx on public.mcp_requests (at desc);

-- Service role only: a log is not a thing a browser session should read or write.
alter table public.mcp_requests enable row level security;

comment on table public.mcp_requests is
  'What an MCP client actually sent and what we answered. Used to debug connector handshakes; holds no secrets.';
