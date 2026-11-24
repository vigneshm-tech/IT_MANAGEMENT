# The ticket knowledge base

The Knowledge base module is articles: written, edited, searched, and published
either publicly or to agents. What it cannot hold is the other half of the job —
the vendor's PDF, the screenshot of the error, the export somebody was sent.

So Tickets has a knowledge base of its own, at `/modules/tickets/kb`.

## What a person sees

- **Upload**: file, title (defaults to the file name), description, tags.
- **List**: title, kind, file name, description, tags, size, uploader and date,
  with search across all of it.
- **View** (`/modules/tickets/kb/<id>`): PDFs, images and text render in place;
  Office files and archives download.
- **Delete**: behind a confirmation panel; removes the index row *and* the object.

Anyone who can open Tickets may upload. The uploader, or anyone who can edit
tickets, may delete.

## How it is stored

| Piece | Where |
| --- | --- |
| Bytes | Supabase Storage bucket `ticket-kb` — **private, no storage policies** |
| Index | `public.ticket_kb_files` (title, description, file name, path, mime, size, tags, uploader) |

The bucket has no policies on purpose: the service role writes and reads, and a
browser can never reach an object even with a valid path. Every read goes through
`GET /api/tickets/kb/<id>/file`, which checks the session and
`can(role, "tickets", "view")` before streaming. `?download=1` forces a save
dialog instead of inline rendering.

Uploads post multipart to `POST /api/tickets/kb/upload` — a route rather than a
server action, because the action body limit is smaller than one screenshot.

## Limits

- **4 MB per file.** The upload passes through a serverless request body, which
  Vercel caps at 4.5 MB. Files above the cap are refused in the browser and again
  in the route, with the cap named in the message.
- Accepted: PDF, PNG/JPEG/GIF/WebP, Word, Excel, PowerPoint, CSV, TXT, MD, ZIP.
- Demo mode (no Supabase) keeps rows and bytes in process memory and seeds two
  text files, so the page can be tried locally.

Migration: `0036_ticket_kb_files.sql`.
