-- The public form has no session, so it cannot read `ticket_slas` or
-- `ticket_calendars` — those rows are agent-only by policy. Rather than widen
-- the policies (which would publish the service targets to anyone), the promise
-- is cut inside the definer function, from the rules as they are now.
--
-- This is the same ordering the app uses: the most specific rule wins — queue
-- and priority together, then queue alone, then priority alone, then the
-- catch-all — and the clock it runs on is the rule's calendar, defaulting to
-- `ist-business`.

create or replace function public.submit_public_ticket(
  p_subject text,
  p_body text,
  p_name text,
  p_email text,
  p_queue_id text,
  p_channel text default 'web',
  p_priority text default 'normal',
  p_state text default 'new',
  p_sla_id text default null,
  p_due_at timestamptz default null,
  p_first_response_due_at timestamptz default null,
  p_tags text[] default '{}',
  p_system_note text default '',
  p_external_id text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_queue_name text;
  v_existing text;
  v_sla text;
  v_first integer;
  v_resolve integer;
  v_offset integer;
  v_start integer;
  v_end integer;
begin
  if p_external_id is not null then
    select ticket_id into v_existing from public.ticket_articles where external_id = p_external_id;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  select name into v_queue_name
  from public.ticket_queues
  where id = p_queue_id and is_public and status = 'active';

  if v_queue_name is null then
    raise exception 'That queue is not open to the public form.' using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(p_subject, ''))) < 4
     or char_length(btrim(coalesce(p_subject, ''))) > 160 then
    raise exception 'A subject needs 4 to 160 characters.' using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(p_body, ''))) < 1
     or char_length(coalesce(p_body, '')) > 8000 then
    raise exception 'A message needs 1 to 8000 characters.' using errcode = '22023';
  end if;

  if p_email is null or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then
    raise exception 'That is not an email address.' using errcode = '22023';
  end if;

  if p_channel not in ('web','email') then
    raise exception 'Unknown channel.' using errcode = '22023';
  end if;

  if p_priority not in ('low','normal','high','urgent') then
    raise exception 'Unknown priority.' using errcode = '22023';
  end if;

  if p_state not in ('new','open','pending') then
    raise exception 'A new ticket cannot start in that state.' using errcode = '22023';
  end if;

  -- The promise, when the caller has no way to read the rules.
  if p_sla_id is null then
    select rule.id, rule.first_response_minutes, rule.resolve_minutes,
           cal.utc_offset_minutes, cal.start_minute, cal.end_minute
      into v_sla, v_first, v_resolve, v_offset, v_start, v_end
    from public.ticket_slas rule
    left join public.ticket_calendars cal
      on cal.id = coalesce(rule.calendar_id, 'ist-business')
    where rule.status = 'active'
      and (rule.queue_id is null or rule.queue_id = p_queue_id)
      and (rule.priority is null or rule.priority = p_priority)
    order by ((rule.queue_id is not null)::int * 2 + (rule.priority is not null)::int) desc,
             rule.sort_order asc
    limit 1;

    if v_sla is not null then
      p_sla_id := v_sla;
      if v_offset is not null then
        if p_first_response_due_at is null then
          p_first_response_due_at := public.ticket_add_business_minutes(
            now(), v_first, v_offset, v_start, v_end
          );
        end if;
        if p_due_at is null then
          p_due_at := public.ticket_add_business_minutes(
            now(), v_resolve, v_offset, v_start, v_end
          );
        end if;
      end if;
    end if;
  end if;

  insert into public.tickets (
    subject, state, priority, queue_id, queue_name,
    owner_id, owner_name, requester_id, requester_name, requester_email,
    channel, tags, sla_id, due_at, first_response_due_at
  ) values (
    btrim(p_subject), p_state, p_priority, p_queue_id, v_queue_name,
    null, '', null, left(btrim(coalesce(p_name, '')), 120), lower(btrim(p_email)),
    p_channel, coalesce(p_tags, '{}'), p_sla_id, p_due_at, p_first_response_due_at
  )
  returning id into v_id;

  insert into public.ticket_articles (
    ticket_id, kind, internal, author_id, author_name, author_role, body, external_id
  ) values (
    v_id,
    case when p_channel = 'email' then 'email' else 'web' end,
    false, null, left(btrim(coalesce(p_name, '')), 120), 'requester', p_body, p_external_id
  );

  if char_length(btrim(coalesce(p_system_note, ''))) > 0 then
    insert into public.ticket_articles (ticket_id, kind, internal, author_id, author_name, author_role, body)
    values (v_id, 'system', true, null, 'Automation', 'system', left(p_system_note, 2000));
  end if;

  return v_id;
end;
$$;

grant execute on function public.submit_public_ticket(
  text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, text[], text, text
) to anon, authenticated;

comment on function public.submit_public_ticket is
  'Files a public or inbound-email ticket and cuts its SLA promise from the live rules.';
