-- Tasks: a person owns the work, and the workflow has six states.
--
-- assignee_id is the profile the work sits with; assignee_role stays for team
-- views and for tasks raised before people could be assigned. The role is
-- derived from the person at save time, never from the form body.

alter table public.tasks
  add column if not exists assignee_id uuid references public.profiles (id) on delete set null,
  add column if not exists assignee_name text not null default '';

create index if not exists tasks_assignee_idx on public.tasks(assignee_id);

comment on column public.tasks.assignee_id is
  'Profile the work sits with. Null only for tasks raised before people were assignable.';
comment on column public.tasks.assignee_name is
  'Name snapshot at assignment time, so the board reads correctly without a join.';

-- "done" becomes "completed"; feedback, failed and reopen are open states.
alter table public.tasks drop constraint if exists tasks_status_check;

update public.tasks set status = 'completed' where status = 'done';

alter table public.tasks
  add constraint tasks_status_check
  check (status in ('todo', 'in_progress', 'completed', 'feedback', 'failed', 'reopen'));

alter table public.tasks alter column status set default 'todo';

comment on column public.tasks.status is
  'todo | in_progress | completed | feedback | failed | reopen.';
