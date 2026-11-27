-- Native ticketing, phase 3: promises, automatic changes and the record.
--
-- Business calendars (the office clock), service targets per queue and
-- priority (promises measured on that clock), triggers (if-this-then-that on
-- ticket events) and the bookkeeping the nightly sweep and the reports need:
-- when the first agent replied, when a promise was missed, how often a ticket
-- came back.
--
-- Mirrors docs/ticketing-plan.md, phase 3.

/* -------------------------------------------------------------------------- */
/*  The office clock                                                          */
/* -------------------------------------------------------------------------- */

-- Timezone is a fixed offset, not an IANA name: every office we serve is in
-- India, which has no daylight saving, so 330 is exact here.
create table if not exists public.ticket_calendars (
  id text primary key,
  name text not null,
  utc_offset_minutes integer not null default 330
    check (utc_offset_minutes between -720 and 840),
  days integer[] not null default '{1,2,3,4,5}',
  start_minute integer not null default 540 check (start_minute between 0 and 1439),
  end_minute integer not null default 1080 check (end_minute between 1 and 1440),
  status text not null default 'active' check (status in ('active','inactive')),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  constraint ticket_calendars_window check (start_minute < end_minute)
);

insert into public.ticket_calendars
  (id, name, utc_offset_minutes, days, start_minute, end_minute, sort_order)
values
  ('ist-business', 'India business hours', 330, '{1,2,3,4,5}', 540, 1080, 10),
  ('ist-extended', 'India extended hours', 330, '{1,2,3,4,5,6}', 480, 1200, 20)
on conflict (id) do nothing;

/**
 * Adds business minutes to an instant, walking Monday–Friday 09:00–18:00 IST.
 * Used only to backfill tickets raised before this migration; the app does the
 * same maths in lib/tickets/sla.ts, where it knows which calendar applies.
 */
create or replace function public.ticket_add_business_minutes(
  from_at timestamptz,
  minutes integer,
  offset_minutes integer default 330,
  start_minute integer default 540,
  end_minute integer default 1080
)
returns timestamptz
language plpgsql
immutable
as $$
declare
  cur bigint;
  left_minutes integer := greatest(0, minutes);
  day_start bigint;
  day_end bigint;
  guard integer := 0;
begin
  if from_at is null then
    return null;
  end if;

  -- Local minutes since the epoch, in the calendar's own time.
  cur := floor(extract(epoch from from_at) / 60)::bigint + offset_minutes;

  -- Walk to the next opening: weekends, evenings and closed days all skip.
  loop
    exit when guard > 500;
    guard := guard + 1;
    day_start := (cur / 1440) * 1440;
    -- `day_start` is local midnight, so reading it as UTC gives the local date.
    if extract(dow from (to_timestamp(day_start * 60) at time zone 'UTC')) between 1 and 5 then
      if cur < day_start + start_minute then
        cur := day_start + start_minute;
        exit;
      end if;
      if cur < day_start + end_minute then
        exit;
      end if;
    end if;
    cur := day_start + 1440;
  end loop;

  guard := 0;
  while left_minutes > 0 and guard < 4000 loop
    guard := guard + 1;
    day_start := (cur / 1440) * 1440;
    day_end := day_start + end_minute;
    if left_minutes <= day_end - cur then
      cur := cur + left_minutes;
      left_minutes := 0;
    else
      left_minutes := left_minutes - (day_end - cur);
      cur := day_start + 1440;
      -- Skip closed days to the next opening.
      loop
        exit when guard > 4400;
        guard := guard + 1;
        day_start := (cur / 1440) * 1440;
        if extract(dow from (to_timestamp(day_start * 60) at time zone 'UTC')) between 1 and 5 then
          cur := day_start + start_minute;
          exit;
        end if;
        cur := day_start + 1440;
      end loop;
    end if;
  end loop;

  return to_timestamp((cur - offset_minutes) * 60);
end;
$$;

/* -------------------------------------------------------------------------- */
/*  Service targets                                                           */
/* -------------------------------------------------------------------------- */

create table if not exists public.ticket_slas (
  id text primary key,
  name text not null,
  queue_id text references public.ticket_queues(id) on delete set null,
  priority text check (priority in ('low','normal','high','urgent')),
  first_response_minutes integer not null check (first_response_minutes between 1 and 43200),
  resolve_minutes integer not null check (resolve_minutes between 1 and 43200),
  calendar_id text references public.ticket_calendars(id) on delete set null,
  status text not null default 'active' check (status in ('active','inactive')),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  constraint ticket_slas_resolve_after_first check (resolve_minutes >= first_response_minutes)
);

create unique index if not exists ticket_slas_name_key
  on public.ticket_slas (lower(btrim(name)));

insert into public.ticket_slas
  (id, name, queue_id, priority, first_response_minutes, resolve_minutes, calendar_id, sort_order)
values
  ('urgent', 'Urgent, any queue', null, 'urgent', 30, 240, 'ist-business', 10),
  ('security', 'Security queue', 'security', null, 60, 480, 'ist-business', 20),
  ('infrastructure', 'Infrastructure queue', 'infrastructure', null, 120, 1440, 'ist-business', 30),
  ('standard', 'Everything else', null, null, 480, 2880, 'ist-business', 90)
on conflict (id) do nothing;

/* -------------------------------------------------------------------------- */
/*  What a ticket owes, and how it has kept up                                */
/* -------------------------------------------------------------------------- */

alter table public.tickets add column if not exists sla_id text;
alter table public.tickets add column if not exists first_response_at timestamptz;
alter table public.tickets add column if not exists first_response_due_at timestamptz;
alter table public.tickets add column if not exists first_response_breached_at timestamptz;
alter table public.tickets add column if not exists resolve_breached_at timestamptz;
alter table public.tickets add column if not exists reminder_sent_at timestamptz;

-- How many times the ticket was taken out of Closed. The reopen rate is this
-- against every ticket that was ever closed.
alter table public.tickets
  add column if not exists reopen_count integer not null default 0;

comment on column public.tickets.first_response_at is
  'First public reply by an agent; the stopwatch for the first-response SLA.';
comment on column public.tickets.resolve_breached_at is
  'Set once by the nightly sweep, so a breach is logged exactly one time.';

create index if not exists tickets_due_idx on public.tickets (due_at)
  where state not in ('closed','merged');
create index if not exists tickets_first_response_idx on public.tickets (first_response_due_at)
  where first_response_at is null;

-- Tickets raised before this migration get the target the rules would give them
-- today. The most specific rule wins: queue and priority together, then queue
-- alone, then priority alone, then the catch-all.
update public.tickets t
set sla_id = matched.sla_id,
    first_response_due_at = public.ticket_add_business_minutes(
      t.created_at, matched.first_response_minutes, cal.utc_offset_minutes, cal.start_minute, cal.end_minute
    ),
    due_at = public.ticket_add_business_minutes(
      t.created_at, matched.resolve_minutes, cal.utc_offset_minutes, cal.start_minute, cal.end_minute
    )
from (
  select distinct on (ticket.id)
    ticket.id as ticket_id,
    rule.id as sla_id,
    rule.first_response_minutes,
    rule.resolve_minutes,
    coalesce(rule.calendar_id, 'ist-business') as calendar_id
  from public.tickets ticket
  join public.ticket_slas rule
    on rule.status = 'active'
   and (rule.queue_id is null or rule.queue_id = ticket.queue_id)
   and (rule.priority is null or rule.priority = ticket.priority)
  order by ticket.id,
    ((rule.queue_id is not null)::int * 2 + (rule.priority is not null)::int) desc,
    rule.sort_order asc
) matched
left join public.ticket_calendars cal on cal.id = matched.calendar_id
where t.id = matched.ticket_id
  and t.sla_id is null;

/* -------------------------------------------------------------------------- */
/*  Triggers                                                                  */
/* -------------------------------------------------------------------------- */

create table if not exists public.ticket_triggers (
  id text primary key,
  name text not null,
  description text not null default '',
  event text not null default 'ticket.created'
    check (event in ('ticket.created','article.created')),
  field text not null default 'subject'
    check (field in ('subject','body','queue','priority','state','tag')),
  operator text not null default 'contains'
    check (operator in ('contains','starts_with','is')),
  value text not null check (char_length(value) between 1 and 120),
  set_state text check (set_state in ('new','open','pending','closed')),
  set_priority text check (set_priority in ('low','normal','high','urgent')),
  set_queue text references public.ticket_queues(id) on delete set null,
  add_tag text not null default '',
  note text not null default '',
  status text not null default 'active' check (status in ('active','inactive')),
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create unique index if not exists ticket_triggers_name_key
  on public.ticket_triggers (lower(btrim(name)));

insert into public.ticket_triggers
  (id, name, description, event, field, operator, value,
   set_state, set_priority, set_queue, add_tag, note, sort_order)
values
  ('outage', 'Outage in the subject', 'Anything raised as an outage goes straight to Infrastructure at urgent.',
   'ticket.created', 'subject', 'contains', 'outage',
   null, 'urgent', 'infrastructure', 'outage',
   'Raised as an outage, so it is in Infrastructure at urgent priority.', 10),
  ('phishing', 'Suspected phishing', 'Phishing reports are a security queue problem, not a service desk one.',
   'ticket.created', 'subject', 'contains', 'phish',
   null, 'high', 'security', 'phishing',
   'Looks like a phishing report, so Security owns it.', 20),
  ('leadership', 'Leadership request', 'A request naming leadership is treated as urgent.',
   'ticket.created', 'subject', 'contains', 'ceo',
   null, 'urgent', null, 'leadership',
   'Came from leadership; treated as urgent.', 30),
  ('still-broken', 'Requester says it is still broken', 'A follow-up that says it is still broken reopens the ticket.',
   'article.created', 'body', 'contains', 'still not working',
   'open', 'high', null, 'comeback',
   'The requester says it is still broken, so the ticket is back open.', 40)
on conflict (id) do nothing;

/* -------------------------------------------------------------------------- */
/*  Policies and grants                                                       */
/* -------------------------------------------------------------------------- */

alter table public.ticket_calendars enable row level security;
alter table public.ticket_slas enable row level security;
alter table public.ticket_triggers enable row level security;

grant select, insert, update, delete on public.ticket_calendars to authenticated;
grant select, insert, update, delete on public.ticket_slas to authenticated;
grant select, insert, update, delete on public.ticket_triggers to authenticated;

/* The clock and the promises are read by agents, kept by IT. */
drop policy if exists ticket_calendars_select on public.ticket_calendars;
create policy ticket_calendars_select on public.ticket_calendars
  for select to authenticated using (public.is_ticket_agent());

drop policy if exists ticket_calendars_write on public.ticket_calendars;
create policy ticket_calendars_write on public.ticket_calendars
  for all to authenticated
  using (public.is_admin() or public.current_app_role() = 'it_manager')
  with check (public.is_admin() or public.current_app_role() = 'it_manager');

drop policy if exists ticket_slas_select on public.ticket_slas;
create policy ticket_slas_select on public.ticket_slas
  for select to authenticated using (public.is_ticket_agent());

drop policy if exists ticket_slas_write on public.ticket_slas;
create policy ticket_slas_write on public.ticket_slas
  for all to authenticated
  using (public.is_admin() or public.current_app_role() = 'it_manager')
  with check (public.is_admin() or public.current_app_role() = 'it_manager');

drop policy if exists ticket_triggers_select on public.ticket_triggers;
create policy ticket_triggers_select on public.ticket_triggers
  for select to authenticated using (public.is_ticket_agent());

drop policy if exists ticket_triggers_write on public.ticket_triggers;
create policy ticket_triggers_write on public.ticket_triggers
  for all to authenticated
  using (public.is_admin() or public.current_app_role() = 'it_manager')
  with check (public.is_admin() or public.current_app_role() = 'it_manager');

comment on table public.ticket_calendars is
  'Business hours the SLA clock runs on (Zammad Calendars), phase 3.';
comment on table public.ticket_slas is
  'First-response and resolution targets per queue and priority (Zammad SLAs).';
comment on table public.ticket_triggers is
  'If-this-then-that rules evaluated when a ticket or article is created (Zammad Triggers).';
