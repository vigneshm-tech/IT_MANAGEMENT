-- TaskTornado — business records: clients, patching plans, approvals, renewals.
-- Applied after 0002_tasks.sql.

create sequence if not exists public.client_number_seq start with 1001;
create sequence if not exists public.patch_number_seq start with 2041;
create sequence if not exists public.approval_number_seq start with 3301;
create sequence if not exists public.renewal_number_seq start with 501;

create table if not exists public.clients (
  id text primary key default ('CL-' || nextval('public.client_number_seq')),
  name text not null check (char_length(name) between 2 and 160),
  code text not null default '',
  contact_name text not null default '',
  contact_email text not null default '',
  industry text not null default '',
  owner_role public.app_role not null,
  status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patch_plans (
  id text primary key default ('PP-' || nextval('public.patch_number_seq')),
  title text not null check (char_length(title) between 2 and 160),
  client_name text not null default '',
  window_date timestamptz not null,
  ring text not null default 'A' check (ring in ('A','B','C')),
  owner_role public.app_role not null,
  status text not null default 'planned' check (status in ('planned','in_progress','completed')),
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.approvals (
  id text primary key default ('AP-' || nextval('public.approval_number_seq')),
  title text not null check (char_length(title) between 4 and 200),
  category text not null default 'change' check (category in ('change','access','patch','purchase')),
  requester_name text not null default '',
  requester_role public.app_role not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by text,
  decided_at timestamptz,
  note text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.renewals (
  id text primary key default ('RN-' || nextval('public.renewal_number_seq')),
  item text not null check (char_length(item) between 2 and 160),
  vendor text not null default '',
  client_name text not null default '',
  amount numeric(14,2) not null default 0,
  currency text not null default 'INR' check (currency in ('INR','USD','EUR')),
  renewal_date timestamptz not null,
  notice_days integer not null default 30,
  owner_role public.app_role not null,
  status text not null default 'active' check (status in ('active','due','renewed','expired')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients enable row level security;
alter table public.patch_plans enable row level security;
alter table public.approvals enable row level security;
alter table public.renewals enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['clients','patch_plans','renewals'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (created_by = auth.uid())',
      t || '_insert', t);

    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (created_by = auth.uid() or public.is_leadership()) with check (created_by = auth.uid() or public.is_leadership())',
      t || '_update', t);

    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_leadership())',
      t || '_delete', t);
  end loop;
end $$;

drop policy if exists approvals_select on public.approvals;
create policy approvals_select on public.approvals for select to authenticated using (true);

drop policy if exists approvals_insert on public.approvals;
create policy approvals_insert on public.approvals
  for insert to authenticated with check (created_by = auth.uid());

-- Only leadership can move a request out of "pending".
drop policy if exists approvals_update on public.approvals;
create policy approvals_update on public.approvals
  for update to authenticated
  using (public.is_leadership())
  with check (public.is_leadership());

drop policy if exists approvals_delete on public.approvals;
create policy approvals_delete on public.approvals
  for delete to authenticated using (public.is_leadership());

do $$
declare
  t text;
begin
  foreach t in array array['clients','patch_plans','approvals','renewals'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
      t || '_touch_updated_at', t);
  end loop;
end $$;

create index if not exists clients_status_idx on public.clients(status);
create index if not exists patch_plans_status_idx on public.patch_plans(status);
create index if not exists approvals_status_idx on public.approvals(status);
create index if not exists renewals_date_idx on public.renewals(renewal_date);

-- Seed data (skipped when the tables already hold records).
insert into public.clients (name, code, contact_name, contact_email, industry, owner_role, status, created_by, created_at)
select s.name, s.code, s.contact_name, s.contact_email, s.industry, s.owner_role::public.app_role, s.status,
       (select coalesce(
          (select id from auth.users where email = 'implementation.lead@tasktornado.dev'),
          (select id from auth.users order by created_at limit 1)
        )),
       now() - (s.age_days || ' days')::interval
from (values
  ('Acme Manufacturing','ACME','Ritu Shah','ritu.shah@acme.example','Manufacturing','implementation_lead','active',120),
  ('Northwind Logistics','NWL','Daniel Roy','daniel.roy@northwind.example','Logistics','l2_support_lead','active',80),
  ('Sterling Health','STH','Meera Iyer','meera.iyer@sterling.example','Healthcare','implementation_manager','active',45),
  ('Vantage Retail','VTR','Arjun Kapoor','arjun.kapoor@vantage.example','Retail','development_lead','inactive',200)
) as s(name, code, contact_name, contact_email, industry, owner_role, status, age_days)
where not exists (select 1 from public.clients);

insert into public.patch_plans (title, client_name, window_date, ring, owner_role, status, notes, created_by)
select s.title, s.client_name, now() + (s.in_days || ' days')::interval, s.ring,
       s.owner_role::public.app_role, s.status, s.notes,
       (select coalesce(
          (select id from auth.users where email = 'it.engineer@tasktornado.dev'),
          (select id from auth.users order by created_at limit 1)
        ))
from (values
  ('November security rollup','Acme Manufacturing',3,'A','it_engineer','planned','Reboot approval confirmed by the client contact.'),
  ('Edge agent update','Northwind Logistics',-2,'B','it_engineer','in_progress','Monitoring for endpoints that miss the window.'),
  ('October critical patches','Sterling Health',-22,'A','it_manager','completed','42 of 42 endpoints compliant.')
) as s(title, client_name, in_days, ring, owner_role, status, notes)
where not exists (select 1 from public.patch_plans);

insert into public.approvals (title, category, requester_name, requester_role, status, decided_by, decided_at, note, created_by)
select s.title, s.category, s.requester_name, s.requester_role::public.app_role, s.status, s.decided_by, s.decided_at, s.note,
       (select id from auth.users where email = s.requester_email)
from (values
  ('Emergency patch exception for radiology servers','patch','Arun Prakash','it_engineer','pending',null::text,null::timestamptz,'Out-of-band patch needed before the vendor audit.','it.engineer@tasktornado.dev'),
  ('Production database access for release 4.8','access','Rahul Menon','development_engineer','pending',null,null,'Read-only access for two days during the release window.','development.engineer@tasktornado.dev'),
  ('Change request: SSO certificate rotation','change','Sneha Pillai','development_lead','pending',null,null,'Certificate expires in 9 days.','development.lead@tasktornado.dev'),
  ('Annual Action1 licence renewal','purchase','Meera Raghavan','it_manager','approved','Ramesh Subramanian',now() - interval '5 days','Approved as part of the annual budget.','it.manager@tasktornado.dev')
) as s(title, category, requester_name, requester_role, status, decided_by, decided_at, note, requester_email)
where not exists (select 1 from public.approvals);

insert into public.renewals (item, vendor, client_name, amount, currency, renewal_date, notice_days, owner_role, status, created_by)
select s.item, s.vendor, s.client_name, s.amount, s.currency, now() + (s.in_days || ' days')::interval, s.notice_days,
       s.owner_role::public.app_role, s.status,
       (select id from auth.users where email = s.owner_email)
from (values
  ('Action1 endpoint licence','Action1','Internal',480000,'INR',12,30,'it_manager','due','it.manager@tasktornado.dev'),
  ('Acme AMC — 2027','Acme Support','Acme Manufacturing',1250000,'INR',38,45,'l2_support_manager','active','l2.manager@tasktornado.dev'),
  ('Sterling private cloud','Sterling Cloud','Sterling Health',8900,'USD',74,60,'implementation_manager','active','implementation.manager@tasktornado.dev'),
  ('Northwind monitoring add-on','Northwind','Northwind Logistics',260000,'INR',-18,30,'l2_support_lead','renewed','l2.lead@tasktornado.dev')
) as s(item, vendor, client_name, amount, currency, in_days, notice_days, owner_role, status, owner_email)
where not exists (select 1 from public.renewals);
