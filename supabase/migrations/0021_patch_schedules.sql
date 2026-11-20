-- Patching plans, endpoint-first.
--
-- The old `patch_plans` row described a "window" per client. A plan now belongs
-- to one server endpoint: a planned date, the IT member who handles it, and the
-- people who must approve it before the work runs. Each approver records their
-- own decision plus the person who verified the patching, which the report
-- prints. Answers stay in their own table so the report can list every sign-off.

create sequence if not exists public.patch_schedule_seq start with 1;

create table if not exists public.patch_schedules (
  id text primary key default ('PS-' || nextval('public.patch_schedule_seq')),
  endpoint_id text not null default '',
  endpoint_name text not null check (char_length(endpoint_name) between 2 and 200),
  missing_count integer not null default 0 check (missing_count >= 0),
  other_count integer not null default 0 check (other_count >= 0),
  planned_date date not null,
  handler_id uuid references public.profiles(id) on delete set null,
  handler_name text not null default '',
  note text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One live plan per endpoint; scheduling the same server again replaces it.
create unique index if not exists patch_schedules_endpoint_unique
  on public.patch_schedules (endpoint_id) where endpoint_id <> '';

create index if not exists patch_schedules_planned_idx
  on public.patch_schedules (planned_date);

create table if not exists public.patch_schedule_approvers (
  schedule_id text not null references public.patch_schedules (id) on delete cascade,
  approver_id uuid not null references public.profiles(id) on delete cascade,
  approver_name text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  verification_name text not null default '',
  note text not null default '',
  decided_at timestamptz,
  primary key (schedule_id, approver_id)
);

alter table public.patch_schedules enable row level security;
alter table public.patch_schedule_approvers enable row level security;

drop policy if exists patch_schedules_select on public.patch_schedules;
create policy patch_schedules_select on public.patch_schedules
  for select to authenticated using (true);

drop policy if exists patch_schedules_insert on public.patch_schedules;
create policy patch_schedules_insert on public.patch_schedules
  for insert to authenticated with check (created_by = auth.uid());

-- The creator reschedules; leadership can correct any plan.
drop policy if exists patch_schedules_update on public.patch_schedules;
create policy patch_schedules_update on public.patch_schedules
  for update to authenticated
  using (created_by = auth.uid() or public.is_leadership())
  with check (created_by = auth.uid() or public.is_leadership());

drop policy if exists patch_schedules_delete on public.patch_schedules;
create policy patch_schedules_delete on public.patch_schedules
  for delete to authenticated using (public.is_leadership());

drop policy if exists patch_approvers_select on public.patch_schedule_approvers;
create policy patch_approvers_select on public.patch_schedule_approvers
  for select to authenticated using (true);

-- Approvers are named by whoever writes the plan.
drop policy if exists patch_approvers_insert on public.patch_schedule_approvers;
create policy patch_approvers_insert on public.patch_schedule_approvers
  for insert to authenticated with check (true);

-- Only the approver themselves decides; leadership may decide on their behalf.
drop policy if exists patch_approvers_update on public.patch_schedule_approvers;
create policy patch_approvers_update on public.patch_schedule_approvers
  for update to authenticated
  using (approver_id = auth.uid() or public.is_leadership())
  with check (approver_id = auth.uid() or public.is_leadership());

drop policy if exists patch_approvers_delete on public.patch_schedule_approvers;
create policy patch_approvers_delete on public.patch_schedule_approvers
  for delete to authenticated using (public.is_leadership());

drop trigger if exists patch_schedules_touch on public.patch_schedules;
create trigger patch_schedules_touch
  before update on public.patch_schedules
  for each row execute function public.touch_updated_at();

comment on table public.patch_schedules is
  'One patching plan per server endpoint: planned date, handler and approvers.';
comment on table public.patch_schedule_approvers is
  'Per-approver decision, including the person who verified the patching.';
