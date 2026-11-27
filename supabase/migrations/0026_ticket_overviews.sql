-- Native ticketing, phase 2 (final slice): saved overviews.
--
-- Zammad's Overviews are named filters pinned above the ticket list. Ours are
-- per person: a name plus the queue / state / priority / tag / owner filters,
-- stored as jsonb so a new filter does not need a migration.
--
-- The four built-in views (Assigned to me, Unassigned, All open, Closed) stay in
-- code because they are part of the rules; overviews only refine them.

create table if not exists public.ticket_overviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 40),
  /** { queue?: string; state?: string; priority?: string; tag?: string; owner?: "me"|"unassigned" } */
  filters jsonb not null default '{}'::jsonb,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create unique index if not exists ticket_overviews_owner_name_key
  on public.ticket_overviews (user_id, lower(btrim(name)));

create index if not exists ticket_overviews_user_idx
  on public.ticket_overviews (user_id, sort_order);

alter table public.ticket_overviews enable row level security;

grant select, insert, update, delete on public.ticket_overviews to authenticated;

-- A person only ever sees and changes their own overviews.
drop policy if exists ticket_overviews_own on public.ticket_overviews;
create policy ticket_overviews_own on public.ticket_overviews
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.ticket_overviews is
  'Per-person saved ticket filters (Zammad Overviews), phase 2 of the ticketing plan.';
