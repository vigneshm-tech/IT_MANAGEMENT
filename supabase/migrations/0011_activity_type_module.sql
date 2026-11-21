-- Every activity type now names the module it belongs to; the task form only
-- offers the ones filed under 'tasks'.

alter table public.activity_types
  add column if not exists module text not null default 'tasks';

-- The same wording may be reused in a different module, so uniqueness is per
-- module rather than global.
drop index if exists public.activity_types_name_unique;
create unique index if not exists activity_types_module_name_unique
  on public.activity_types (module, lower(name));

create index if not exists activity_types_module_status_idx
  on public.activity_types (module, status);

comment on column public.activity_types.module is 'Module the type belongs to: tasks, tickets, servers, patching, clients, renewals, approvals.';
