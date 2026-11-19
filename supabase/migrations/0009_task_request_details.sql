-- Request details captured by the full-page task form.
-- The task id stays database-generated; the requester is filled from the session.

alter table public.tasks
  add column if not exists client_name text not null default '',
  add column if not exists activity_type text not null default '',
  add column if not exists requested_by_name text not null default '',
  add column if not exists requested_by_email text not null default '',
  add column if not exists server_details text not null default '',
  add column if not exists plan_status text not null default 'unplanned',
  add column if not exists communication text not null default '',
  add column if not exists reference_ticket_no text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_plan_status_check'
  ) then
    alter table public.tasks
      add constraint tasks_plan_status_check check (plan_status in ('planned', 'unplanned'));
  end if;
end $$;

comment on column public.tasks.client_name is 'Client the request came from.';
comment on column public.tasks.activity_type is 'Patching, incident, service request, change request, …';
comment on column public.tasks.requested_by_name is 'Requester name captured from the signed-in account.';
comment on column public.tasks.requested_by_email is 'Requester email captured from the signed-in account.';
comment on column public.tasks.server_details is 'Hostnames, environment or asset tags in scope.';
comment on column public.tasks.plan_status is 'planned | unplanned.';
comment on column public.tasks.communication is 'Who was informed and through which channel.';
comment on column public.tasks.reference_ticket_no is 'Portal ticket number supplied by the requester.';
