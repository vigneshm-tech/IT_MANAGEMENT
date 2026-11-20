-- Two more master registers under Masters:
--   industries    — the client form's Industry dropdown
--   custom_fields — extra fields, each filed under exactly one module
--
-- Both follow the activity_types pattern: text ids, active/inactive status,
-- RLS that lets everyone read and masters editors write.

/* -------------------------------------------------------------------------- */
/*  Industries                                                                */
/* -------------------------------------------------------------------------- */

create sequence if not exists public.industry_seq start with 1;

create table if not exists public.industries (
  id text primary key default ('IND-' || nextval('public.industry_seq')),
  name text not null check (char_length(name) between 2 and 60),
  status text not null default 'active' check (status in ('active','inactive')),
  sort_order integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists industries_name_unique
  on public.industries (lower(name));

alter table public.industries enable row level security;

drop policy if exists industries_select on public.industries;
create policy industries_select on public.industries
  for select to authenticated using (true);

drop policy if exists industries_insert on public.industries;
create policy industries_insert on public.industries
  for insert to authenticated
  with check (public.can_edit_masters() and created_by = auth.uid());

drop policy if exists industries_update on public.industries;
create policy industries_update on public.industries
  for update to authenticated
  using (public.can_edit_masters())
  with check (public.can_edit_masters());

drop policy if exists industries_delete on public.industries;
create policy industries_delete on public.industries
  for delete to authenticated using (public.can_edit_masters());

drop trigger if exists industries_touch_updated_at on public.industries;
create trigger industries_touch_updated_at
  before update on public.industries
  for each row execute function public.touch_updated_at();

create index if not exists industries_status_idx on public.industries(status);

-- The common industries plus anything the client register already stored, so
-- every existing client keeps a matching option.
insert into public.industries (name)
select v.name from (values
  ('Manufacturing'), ('Logistics'), ('Healthcare'), ('Retail'), ('Banking'),
  ('Insurance'), ('Education'), ('Hospitality'), ('Automotive'),
  ('Construction'), ('Energy'), ('Pharmaceuticals'),
  ('Telecommunications'), ('Information technology'), ('Government'), ('Other')
) as v(name)
where not exists (
  select 1 from public.industries i where lower(i.name) = lower(v.name)
);

insert into public.industries (name)
select distinct c.industry
  from public.clients c
 where c.industry <> ''
   and not exists (
     select 1 from public.industries i where lower(i.name) = lower(c.industry)
   );

comment on table public.industries is
  'Master register: the Industry options the client form offers.';

/* -------------------------------------------------------------------------- */
/*  Custom fields                                                             */
/* -------------------------------------------------------------------------- */

create sequence if not exists public.custom_field_seq start with 1;

create table if not exists public.custom_fields (
  id text primary key default ('CF-' || nextval('public.custom_field_seq')),
  name text not null check (char_length(name) between 2 and 60),
  module text not null default 'tasks',
  status text not null default 'active' check (status in ('active','inactive')),
  sort_order integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The same field name may exist for two modules; it may not repeat inside one.
create unique index if not exists custom_fields_module_name_unique
  on public.custom_fields (module, lower(name));

create index if not exists custom_fields_module_status_idx
  on public.custom_fields (module, status);

alter table public.custom_fields enable row level security;

drop policy if exists custom_fields_select on public.custom_fields;
create policy custom_fields_select on public.custom_fields
  for select to authenticated using (true);

drop policy if exists custom_fields_insert on public.custom_fields;
create policy custom_fields_insert on public.custom_fields
  for insert to authenticated
  with check (public.can_edit_masters() and created_by = auth.uid());

drop policy if exists custom_fields_update on public.custom_fields;
create policy custom_fields_update on public.custom_fields
  for update to authenticated
  using (public.can_edit_masters())
  with check (public.can_edit_masters());

drop policy if exists custom_fields_delete on public.custom_fields;
create policy custom_fields_delete on public.custom_fields
  for delete to authenticated using (public.can_edit_masters());

drop trigger if exists custom_fields_touch_updated_at on public.custom_fields;
create trigger custom_fields_touch_updated_at
  before update on public.custom_fields
  for each row execute function public.touch_updated_at();

comment on table public.custom_fields is
  'Master register: extra fields, each filed under one module.';
comment on column public.custom_fields.module is
  'tasks, tickets, servers, patching, clients, renewals, approvals.';
