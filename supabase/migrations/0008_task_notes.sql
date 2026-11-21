-- Task notes — append-only working notes shown in the task detail dialog and
-- written by the "Update notes" action on the board.

alter table public.tasks
  add column if not exists notes text not null default '';

comment on column public.tasks.notes is
  'Append-only working notes; each entry is a stamped block separated by a blank line.';
