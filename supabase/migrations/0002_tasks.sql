-- TaskTornado milestone 1 — tasks table, RLS policies and demo seed.
-- Applied after 0001_rbac.sql. The app writes here when Supabase is configured.

create sequence if not exists public.task_number_seq start with 1043;

create table if not exists public.tasks (
  id text primary key default ('TSK-' || nextval('public.task_number_seq')),
  title text not null check (char_length(title) between 4 and 200),
  description text not null default '',
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  status text not null default 'todo' check (status in ('todo','in_progress','done')),
  assignee_role public.app_role not null,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null default '',
  created_by_role public.app_role not null,
  due_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

-- Everyone signed in can read the board.
drop policy if exists tasks_select_all on public.tasks;
create policy tasks_select_all on public.tasks
  for select to authenticated using (true);

-- You can only create a task as yourself. The 09:00–18:00 IST window is
-- enforced in the server action before this insert runs.
drop policy if exists tasks_insert_self on public.tasks;
create policy tasks_insert_self on public.tasks
  for insert to authenticated with check (created_by = auth.uid());

-- Assignee team or leadership can move a task.
drop policy if exists tasks_update_team on public.tasks;
create policy tasks_update_team on public.tasks
  for update to authenticated
  using (assignee_role = public.current_app_role() or public.is_leadership())
  with check (assignee_role = public.current_app_role() or public.is_leadership());

drop policy if exists tasks_delete_leadership on public.tasks;
create policy tasks_delete_leadership on public.tasks
  for delete to authenticated using (public.is_leadership());

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

create index if not exists tasks_status_idx on public.tasks(status);
create index if not exists tasks_assignee_idx on public.tasks(assignee_role);
