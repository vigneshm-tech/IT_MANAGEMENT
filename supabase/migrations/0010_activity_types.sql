-- Master register for task activity types. The task form reads this list, so
-- the vocabulary is data — added and retired in Masters, not in code.

create sequence if not exists public.activity_type_seq start with 1;

create table if not exists public.activity_types (
  id text primary key default ('AT-' || nextval('public.activity_type_seq')),
  name text not null check (char_length(name) between 2 and 60),
  status text not null default 'active' check (status in ('active','inactive')),
  sort_order integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists activity_types_name_unique
  on public.activity_types (lower(name));

-- Masters editing is the IT Manager plus leadership — the same rule the app
-- applies to the other master registers (lib/modules.ts, access.edit).
create or replace function public.can_edit_masters()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_app_role() = 'it_manager' or public.is_leadership(), false);
$$;

alter table public.activity_types enable row level security;

drop policy if exists activity_types_select on public.activity_types;
create policy activity_types_select on public.activity_types
  for select to authenticated using (true);

drop policy if exists activity_types_insert on public.activity_types;
create policy activity_types_insert on public.activity_types
  for insert to authenticated
  with check (public.can_edit_masters() and created_by = auth.uid());

drop policy if exists activity_types_update on public.activity_types;
create policy activity_types_update on public.activity_types
  for update to authenticated
  using (public.can_edit_masters())
  with check (public.can_edit_masters());

drop policy if exists activity_types_delete on public.activity_types;
create policy activity_types_delete on public.activity_types
  for delete to authenticated using (public.can_edit_masters());

drop trigger if exists activity_types_touch_updated_at on public.activity_types;
create trigger activity_types_touch_updated_at
  before update on public.activity_types
  for each row execute function public.touch_updated_at();

create index if not exists activity_types_status_idx on public.activity_types(status);

-- Seed the types that used to be hard-coded in the task form.
insert into public.activity_types (name, sort_order, created_by)
select v.name, v.sort_order,
       (select coalesce(
          (select id from auth.users where email = 'it.manager@tasktornado.dev'),
          (select id from auth.users order by created_at limit 1)
        ))
from (values
  ('Patching',10),
  ('Incident',20),
  ('Service request',30),
  ('Change request',40),
  ('Preventive maintenance',50),
  ('Onboarding',60),
  ('Audit',70),
  ('Other',80)
) as v(name, sort_order)
where not exists (select 1 from public.activity_types);
