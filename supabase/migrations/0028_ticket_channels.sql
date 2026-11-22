-- Native ticketing, phase 4: channels and self-service.
--
-- Three surfaces that bring work in from outside the workspace:
--
--   * the public web form at /support/new, which files a ticket with no account
--     at all (so `requester_id` stays null and the contact lives in the
--     `requester_*` snapshot columns);
--   * the knowledge base, whose public articles are readable by anyone and whose
--     internal ones never leave the agent side;
--   * the email channel — a mailbox that posts inbound mail to a signed route
--     and an outbox the app fills when an agent replies.
--
-- The two `security definer` functions below exist because a visitor has no
-- session: they are the only way to write a ticket without one, and they are
-- narrow on purpose — insert only, queue must be public, and a reply has to come
-- from the address already on the ticket.
--
-- Mirrors docs/ticketing-plan.md, phase 4.

/* -------------------------------------------------------------------------- */
/*  Queues offered to the public                                              */
/* -------------------------------------------------------------------------- */

alter table public.ticket_queues
  add column if not exists is_public boolean not null default false;

comment on column public.ticket_queues.is_public is
  'Offered on the public web form at /support/new.';

update public.ticket_queues set is_public = true where id = 'service-desk';

/* -------------------------------------------------------------------------- */
/*  Knowledge base                                                            */
/* -------------------------------------------------------------------------- */

create table if not exists public.kb_categories (
  id text primary key,
  name text not null,
  description text not null default '',
  sort_order integer not null default 100,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now()
);

create unique index if not exists kb_categories_name_key
  on public.kb_categories (lower(btrim(name)));

create table if not exists public.kb_articles (
  id text primary key,
  category_id text not null references public.kb_categories(id) on delete restrict,
  title text not null check (char_length(title) between 4 and 120),
  summary text not null default '' check (char_length(summary) <= 240),
  body text not null check (char_length(body) between 20 and 20000),
  visibility text not null default 'public' check (visibility in ('public','internal')),
  status text not null default 'active' check (status in ('active','inactive')),
  tags text[] not null default '{}',
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kb_articles_category_idx
  on public.kb_articles (category_id, visibility, status);

insert into public.kb_categories (id, name, description, sort_order) values
  ('getting-started', 'Getting started', 'How the service desk works and what to expect', 10),
  ('network', 'Network and VPN', 'Connectivity, Wi-Fi, VPN and the office link', 20),
  ('accounts', 'Accounts and access', 'Passwords, MFA, mailboxes and permissions', 30),
  ('devices', 'Laptops and devices', 'Setup, printing and hardware', 40),
  ('security', 'Security', 'Phishing, incidents and access reviews', 50)
on conflict (id) do nothing;

insert into public.kb_articles (id, category_id, title, summary, body, visibility, tags, sort_order) values
  ('vpn-keeps-dropping', 'network', 'The VPN keeps dropping',
   'What to try before raising a ticket, and what we need from you if it still drops.',
   E'Reconnect once before anything else: disconnect the client completely, restart the machine, then reconnect and note the time it drops again.\n\nIf it still drops, reply with:\n\n1. the time it dropped;\n2. whether the wired connection stays up;\n3. whether others on your floor see it too.\n\nWe keep a carrier ticket open for the Chennai circuit, so a timestamp is the fastest way for us to join your report to it.',
   'public', '{vpn,network,reconnect}', 10),
  ('reset-your-password', 'accounts', 'Reset your password',
   'Reset it yourself in two minutes, and what to do if MFA is the problem.',
   E'Use the sign-in page and choose "Forgot password". The reset link goes to your mailbox and is valid for one hour.\n\nIf you cannot get past the second factor, do not raise a password ticket — raise one for MFA and tell us which phone or app you registered with. Resetting a password does not reset the second factor, and that is usually the real problem.',
   'public', '{password,reset,mfa,access}', 20),
  ('new-laptop-setup', 'devices', 'Set up a new laptop',
   'What is already installed, what you need to do on day one, and how long it takes.',
   E'New laptops arrive imaged: Windows or macOS, the VPN client, the endpoint agent and the standard Office suite. Sign in with your work account and the rest installs itself.\n\nOn day one:\n\n1. sign in and let the endpoint agent check in (it takes about ten minutes);\n2. connect the VPN once, so we know the profile works;\n3. enrol MFA if you are new.\n\nRaise a ticket if the endpoint agent has not checked in after an hour.',
   'public', '{laptop,onboarding,setup,device}', 30),
  ('report-a-phishing-email', 'security', 'Report a phishing email',
   'Where to send it, and why forwarding it to a colleague is the wrong move.',
   E'Forward the message as an attachment to the security queue, or raise a ticket with the sender and subject. Do not click links, and do not forward it to colleagues to ask if it looks real — that spreads it.\n\nIf you already entered credentials, say so in the ticket. We will reset the password and revoke sessions, and that is much faster than finding out a week later.',
   'public', '{phishing,email,security,spam}', 40),
  ('clear-a-printer-jam', 'devices', 'Clear a printer jam',
   'The two panels to open, and the one thing not to pull.',
   E'Open the front cover, then the rear duplex panel. Pull the sheet in the direction it was travelling — pulling backwards tears it and leaves a scrap in the sensor.\n\nIf the display still shows a jam, power the printer off for thirty seconds. A jam that returns on the same tray is a hardware fault; raise a ticket with the tray number.',
   'public', '{printer,paper,hardware}', 50),
  ('support-escalation-matrix', 'getting-started', 'Support escalation matrix',
   'Internal: who owns a queue, and when to escalate rather than sit on it.',
   E'Service desk owns everyday requests. Infrastructure owns the office link, servers and patching. Applications owns the business systems. Security owns phishing, incidents and access reviews.\n\nEscalate to the IT manager when:\n\n- a ticket breaches its first-response target twice in one day;\n- more than one person reports the same outage;\n- the requester is leadership or a client contact.\n\nNever leave a ticket in Pending without a reminder date: the sweep closes it after seven days.',
   'internal', '{escalation,sla,priority,internal}', 60),
  ('mailbox-quota-and-archives', 'accounts', 'Mailbox quota and archives',
   'Internal: how the 50 GB quota is enforced and how archives are requested.',
   E'Mailboxes are capped at 50 GB. At 90% the user gets a warning; at 100% sending stops but receiving continues for seven days.\n\nAsk the user to empty Deleted Items and Sent Items first — that reclaims about a fifth in practice. Archive requests go to the IT manager with the mailbox address and the retention period; archives are exported as PST and kept for thirty days before deletion.',
   'internal', '{mailbox,quota,archive,internal}', 70)
on conflict (id) do nothing;

/* -------------------------------------------------------------------------- */
/*  Email channel                                                             */
/* -------------------------------------------------------------------------- */

create table if not exists public.ticket_email_settings (
  id text primary key default 'default',
  enabled boolean not null default false,
  address text not null default '',
  provider text not null default 'imap' check (provider in ('imap','graph','relay')),
  mailbox text not null default 'INBOX',
  relay_url text not null default '',
  default_queue_id text references public.ticket_queues(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.ticket_email_settings (id, default_queue_id) values ('default', 'service-desk')
on conflict (id) do nothing;

create table if not exists public.ticket_outbox (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null references public.tickets(id) on delete cascade,
  to_address text not null,
  subject text not null,
  body text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed')),
  attempts integer not null default 0,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists ticket_outbox_ticket_idx on public.ticket_outbox (ticket_id, created_at desc);
create index if not exists ticket_outbox_queued_idx on public.ticket_outbox (status, created_at);

-- A worker that retries a message must not file it twice.
alter table public.ticket_articles add column if not exists external_id text;
create unique index if not exists ticket_articles_external_key
  on public.ticket_articles (external_id)
  where external_id is not null;

/* -------------------------------------------------------------------------- */
/*  Writing a ticket without a session                                        */
/* -------------------------------------------------------------------------- */

/**
 * Files a ticket from the public form or the email channel.
 *
 * The caller does the thinking — the promise, the triggers, the tags — and hands
 * the result in, so the SLA clock and the rule engine stay in one place
 * (lib/tickets). This function only guards and writes: the queue has to be
 * public, the lengths are the same ones the agent form enforces, and the
 * requester has no profile row.
 */
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

/**
 * Appends an inbound email to the thread it belongs to.
 *
 * The reference in the subject is a hint, not a credential: the message is only
 * accepted when the sender is the address already on that ticket. A closed or
 * pending ticket reopens, because a requester writing again is work.
 *
 * Returns the ticket id, or null when the reference points at nothing the sender
 * owns — the caller then files it as a new ticket.
 */
create or replace function public.append_inbound_article(
  p_reference text,
  p_from_email text,
  p_from_name text,
  p_body text,
  p_external_id text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_email text := lower(btrim(coalesce(p_from_email, '')));
  v_state text;
begin
  if p_external_id is not null then
    select ticket_id into v_id from public.ticket_articles where external_id = p_external_id;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  if p_reference is null or p_reference !~* '^TT-[0-9]{3,7}$' then
    return null;
  end if;

  select id, state into v_id, v_state
  from public.tickets
  where id = upper(p_reference) and lower(requester_email) = v_email;

  if v_id is null then
    return null;
  end if;

  if char_length(btrim(coalesce(p_body, ''))) < 1 or char_length(coalesce(p_body, '')) > 8000 then
    raise exception 'A message needs 1 to 8000 characters.' using errcode = '22023';
  end if;

  insert into public.ticket_articles (
    ticket_id, kind, internal, author_id, author_name, author_role, body, external_id
  ) values (
    v_id, 'email', false, null, left(btrim(coalesce(p_from_name, '')), 120), 'requester', p_body, p_external_id
  );

  if v_state in ('closed', 'pending') then
    update public.tickets
    set state = 'open',
        closed_at = null,
        reopen_count = case when v_state = 'closed' then reopen_count + 1 else reopen_count end
    where id = v_id;
  else
    update public.tickets set updated_at = now() where id = v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.submit_public_ticket(
  text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, text[], text, text
) to anon, authenticated;

grant execute on function public.append_inbound_article(text, text, text, text, text)
  to anon, authenticated;

/* -------------------------------------------------------------------------- */
/*  Policies and grants                                                       */
/* -------------------------------------------------------------------------- */

alter table public.kb_categories enable row level security;
alter table public.kb_articles enable row level security;
alter table public.ticket_email_settings enable row level security;
alter table public.ticket_outbox enable row level security;

grant select, insert, update, delete on public.kb_categories to authenticated;
grant select, insert, update, delete on public.kb_articles to authenticated;
grant select, insert, update, delete on public.ticket_email_settings to authenticated;
grant select, insert, update, delete on public.ticket_outbox to authenticated;
grant select on public.kb_categories to anon;
grant select on public.kb_articles to anon;

/* The public form lists the open queues, so a visitor may read just those. */
grant select on public.ticket_queues to anon;

drop policy if exists ticket_queues_anon on public.ticket_queues;
create policy ticket_queues_anon on public.ticket_queues
  for select to anon using (is_public and status = 'active');

/* Public pages read the public shelf; agents read the whole one. */
drop policy if exists kb_categories_select on public.kb_categories;
create policy kb_categories_select on public.kb_categories
  for select to authenticated using (true);

drop policy if exists kb_categories_anon on public.kb_categories;
create policy kb_categories_anon on public.kb_categories
  for select to anon using (status = 'active');

drop policy if exists kb_categories_write on public.kb_categories;
create policy kb_categories_write on public.kb_categories
  for all to authenticated
  using (public.is_admin() or public.current_app_role() = 'it_manager')
  with check (public.is_admin() or public.current_app_role() = 'it_manager');

drop policy if exists kb_articles_select on public.kb_articles;
create policy kb_articles_select on public.kb_articles
  for select to authenticated
  using ((visibility = 'public' and status = 'active') or public.is_ticket_agent());

drop policy if exists kb_articles_anon on public.kb_articles;
create policy kb_articles_anon on public.kb_articles
  for select to anon using (visibility = 'public' and status = 'active');

drop policy if exists kb_articles_write on public.kb_articles;
create policy kb_articles_write on public.kb_articles
  for all to authenticated
  using (public.is_admin() or public.current_app_role() = 'it_manager')
  with check (public.is_admin() or public.current_app_role() = 'it_manager');

/* The channel's settings and its outbox belong to the agents. */
drop policy if exists ticket_email_settings_select on public.ticket_email_settings;
create policy ticket_email_settings_select on public.ticket_email_settings
  for select to authenticated using (public.is_ticket_agent());

drop policy if exists ticket_email_settings_write on public.ticket_email_settings;
create policy ticket_email_settings_write on public.ticket_email_settings
  for all to authenticated
  using (public.is_admin() or public.current_app_role() = 'it_manager')
  with check (public.is_admin() or public.current_app_role() = 'it_manager');

drop policy if exists ticket_outbox_select on public.ticket_outbox;
create policy ticket_outbox_select on public.ticket_outbox
  for select to authenticated using (public.is_ticket_agent());

drop policy if exists ticket_outbox_write on public.ticket_outbox;
create policy ticket_outbox_write on public.ticket_outbox
  for all to authenticated using (public.is_ticket_agent())
  with check (public.is_ticket_agent());

comment on table public.kb_categories is
  'Knowledge base categories (Zammad Knowledge Base), phase 4.';
comment on table public.kb_articles is
  'Knowledge base articles: `public` ones are readable without an account.';
comment on table public.ticket_email_settings is
  'One row: the support address, how it is read, and where replies are relayed.';
comment on table public.ticket_outbox is
  'Replies waiting to leave by email; `sent`/`failed` rows stay as the record.';
