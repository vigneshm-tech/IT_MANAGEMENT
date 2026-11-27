-- Files in the ticket knowledge base.
--
-- The Knowledge base module is articles: written, edited and searched. What it
-- cannot hold is the thing people actually attach to a fix — the vendor's PDF,
-- the screenshot of the error, the Excel export we were sent. So Tickets gets a
-- knowledge base of its own: a private library of files that anyone who can open
-- Tickets may upload and read.
--
-- Bytes live in a private Storage bucket; this table is the index (title,
-- description, tags, who uploaded it). Nothing is public: the file route streams
-- through the app after a session and a role check, so an object URL is never the
-- thing protecting the file.

create table if not exists public.ticket_kb_files (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text not null default '' check (char_length(description) <= 500),
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes > 0),
  tags text[] not null default '{}',
  uploaded_by_id text not null default '',
  uploaded_by_name text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists ticket_kb_files_created_idx
  on public.ticket_kb_files (created_at desc);

alter table public.ticket_kb_files enable row level security;

-- Readable and writable by anyone signed in; the actions and routes enforce
-- `can(role, "tickets", "view")` before they touch a row.
drop policy if exists ticket_kb_files_rw on public.ticket_kb_files;
create policy ticket_kb_files_rw on public.ticket_kb_files
  for all to authenticated using (true) with check (true);

comment on table public.ticket_kb_files is
  'Index of files in the ticket knowledge base. Bytes live in the private ticket-kb bucket.';

-- The bucket. Private, no storage policies: objects are written and read only by
-- the service role, from the upload route and the file route.
insert into storage.buckets (id, name, public, file_size_limit)
values ('ticket-kb', 'ticket-kb', false, 26214400)
on conflict (id) do nothing;
