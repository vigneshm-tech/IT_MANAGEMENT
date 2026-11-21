-- Values for master-defined custom fields.
--
-- A field is defined once in `custom_fields` with the module it belongs to.
-- This table stores what a record answered, so the pointed module can render
-- the field on its form and read the value back without any per-module column.
-- `record_id` is deliberately text: clients are CL-1001, tasks are TSK-1042,
-- and Supabase-mode rows use uuids — one shape covers every module.

create table if not exists public.custom_field_values (
  field_id text not null references public.custom_fields (id) on delete cascade,
  record_id text not null,
  value text not null default '',
  updated_at timestamptz not null default now(),
  primary key (field_id, record_id)
);

create index if not exists custom_field_values_record_idx
  on public.custom_field_values (record_id);

alter table public.custom_field_values enable row level security;

-- Everyone who can read a module can read its answers; only masters editors
-- change the field definitions, but any authenticated editor may fill values in.
drop policy if exists custom_field_values_select on public.custom_field_values;
create policy custom_field_values_select on public.custom_field_values
  for select to authenticated using (true);

drop policy if exists custom_field_values_insert on public.custom_field_values;
create policy custom_field_values_insert on public.custom_field_values
  for insert to authenticated with check (true);

drop policy if exists custom_field_values_update on public.custom_field_values;
create policy custom_field_values_update on public.custom_field_values
  for update to authenticated using (true) with check (true);

drop policy if exists custom_field_values_delete on public.custom_field_values;
create policy custom_field_values_delete on public.custom_field_values
  for delete to authenticated using (true);

create or replace function public.touch_custom_field_value()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists custom_field_values_touch on public.custom_field_values;
create trigger custom_field_values_touch
  before update on public.custom_field_values
  for each row execute function public.touch_custom_field_value();

comment on table public.custom_field_values is
  'Answers to master-defined custom fields, keyed by field and record id so any module can use them.';
