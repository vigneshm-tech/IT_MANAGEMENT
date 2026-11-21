-- One more master register under Masters: request types.
--
-- The approval form used to offer four hard-coded kinds and `approvals.category`
-- was pinned to them by a check constraint, so a workspace could not add a type
-- of its own. The register follows the industries pattern: a slug id, a display
-- name, active/inactive status, everyone reads, masters editors write.
--
-- The seeds keep the ids the register already stored ('change', 'access',
-- 'patch', 'purchase'), so every existing approval still resolves to a type.

create table if not exists public.request_types (
  id text primary key,
  name text not null check (char_length(name) between 2 and 40),
  status text not null default 'active' check (status in ('active','inactive')),
  sort_order integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists request_types_name_unique
  on public.request_types (lower(name));

alter table public.request_types enable row level security;

drop policy if exists request_types_select on public.request_types;
create policy request_types_select on public.request_types
  for select to authenticated using (true);

drop policy if exists request_types_insert on public.request_types;
create policy request_types_insert on public.request_types
  for insert to authenticated
  with check (public.can_edit_masters() and created_by = auth.uid());

drop policy if exists request_types_update on public.request_types;
create policy request_types_update on public.request_types
  for update to authenticated
  using (public.can_edit_masters())
  with check (public.can_edit_masters());

drop policy if exists request_types_delete on public.request_types;
create policy request_types_delete on public.request_types
  for delete to authenticated using (public.can_edit_masters());

drop trigger if exists request_types_touch_updated_at on public.request_types;
create trigger request_types_touch_updated_at
  before update on public.request_types
  for each row execute function public.touch_updated_at();

create index if not exists request_types_status_idx on public.request_types(status);

insert into public.request_types (id, name, sort_order) values
  ('change',   'Change',          10),
  ('access',   'Access',          20),
  ('patch',    'Patch exception', 30),
  ('purchase', 'Purchase',        40)
on conflict (id) do nothing;

-- The four words were the only values the column allowed; the register now
-- decides, so the constraint goes. Existing rows are untouched.
alter table public.approvals drop constraint if exists approvals_category_check;

comment on column public.approvals.category is
  'Request type id from public.request_types (change, access, patch, purchase, or a type added in Masters).';
