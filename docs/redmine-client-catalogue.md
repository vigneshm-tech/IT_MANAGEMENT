# The Redmine client list, captured into our database

The portal's tickets in Redmine carry a **Client-eShopaid** custom field (id 112)
whose value is written as `<Client> | <code> | <code>` — `Skin | SK`, for
example. That string is the client's identity on the Redmine side: an update has
to send it back exactly as stored, so it is a key, not a label.

Redmine has no endpoint that lists the values of a custom field. The only
reliable source is the tickets themselves, so the list is **captured** by walking
the project's issues once and keeping the distinct values. This is the method a
C# proof of concept was written around; it is now part of the app.

## Where it lives

| Piece | File |
| --- | --- |
| Reading Redmine, page by page | `lib/integrations/redmine-clients.ts` |
| Storing and reading the capture | `lib/tickets/redmine-clients.ts` |
| Tables | `supabase/migrations/0040_redmine_clients.sql` |
| Page (with **Sync now**) | `app/(app)/modules/tickets/redmine/clients` |
| Also shown in the Clients module | `/modules/clients` — tab *From Redmine* |
| Entry points | **Clients** on the Redmine portal header; *From Redmine* tab in Clients |

## How the scan works

- `GET /issues.json?project_id=674&status_id=*&sort=updated_on:desc&limit=100&offset=N`
  — every status, because the oldest account may only have closed tickets.
- Each ticket's `custom_fields` entry with id 112 is read; a string and an array
  (multi-value fields) are both accepted.
- The value is split on `|` into a name and its short codes. The value itself is
  kept byte for byte; only the name and codes are trimmed.
- The scan stops at 10,000 tickets or at the last page. When it stops early the
  capture is marked truncated and the page says so.
- One failed page fails the whole scan. Half a list is worse than a failed sync,
  because the caller would delete the clients it never saw.

## Storing it

`public.redmine_clients` holds one row per value — the exact string, its name,
its codes, how many scanned tickets carried it, the newest such ticket, and when
it was first seen. `public.redmine_client_sync` holds one row describing the last
attempt: project, field, tickets read, whether it was truncated, when it ran, how
long it took and why it failed.

- **First-seen dates survive a sync** — an upsert does not touch them.
- Values that disappeared from Redmine are deleted, but only when the scan ran to
  the end; a truncated scan never looked at the older tickets.
- **A failed sync keeps the previous list** and records the reason. The page shows
  the message and says the list is from the last successful capture.
- Writes use the service role. The tables' only policy is "any signed-in person
  may read", because a client list is organisation-wide.

## Sync now

The button on `/modules/tickets/redmine/clients` posts a server action
(`syncRedmineClientsAction`) that:

1. checks `can(role, "tickets", "edit")` — the key belongs to the person, and the
   list is shared;
2. scans Redmine with that person's key;
3. stores the result and answers with a sentence under the button
   (`Synced 68 clients from 1,432 tickets.`).

Nothing else on the page calls Redmine. A page load reads our tables only.

## Project and field

`674` and `112` are the defaults. Both can be changed per profile in
**Settings → Integrations → Redmine** (Portal project id, Client field id), which
is where the scan's two assumptions are visible instead of buried in code.

## Also in the Clients module

The captured list is a client list, so it also lives where clients live:
`/modules/clients` now has two tabs — **Client register** (the accounts we
maintain) and **From Redmine** (everything the scan captured). Both use the same
panel; the register keeps its Import and Add client buttons, the captured tab
gets **Sync now**.

Opening `/modules/clients` with no `view` picks the tab a reader needs rather
than the one the code happens to default to: if the register has no rows and the
capture does, the captured list opens (an empty register would otherwise present
the module as empty while the client list sat one tab away). A single register
row, or an explicit `?view=`, overrides that. `resolveClientTab` in
`lib/clients.ts` is the rule, and it is unit tested.

Who may sync is `canSyncRedmineClients(role)` — the tickets *edit* right or the
clients *edit* right, since the list is client data read out of Tickets. The scan
still only returns what the caller's own Redmine key can see, and the action
re-checks the role rather than trusting the hidden button.

## The task form's client picker

*Client name* on the task form (create and edit) is now a search dropdown over
both lists, not a free-text box with browser autocomplete: register accounts
first (hinted `Client register · ACME · Manufacturing`), then captured Redmine
clients the register does not have (`Redmine · SK`). One row per name, register
wins a tie, inactive accounts are left out, and the client's display name is what
the task stores. `clientChoices` in `lib/clients.ts` builds that list and is
unit tested. With no clients anywhere the field falls back to plain text, so a
task can still be raised.

The server action stays permissive about the name — an old task may hold a
client that has since been retired, and the picker keeps that stored value
selectable rather than dropping it silently.

## Matching our own clients

The page shows, per Redmine value, whether the client register already has a
record: an exact match on the short code or on the whole client name. Only exact
matches count — pointing a Redmine ticket at the wrong account is worse than
pointing at none — so anything else stays "Not in the register" for a person to
decide.

## Not in this change

Setting the client (or the asset, task type and the other custom fields) back on
a ticket is not wired up yet. The captured `value` is exactly what such a `PUT
/issues/<id>.json` needs:

```json
{ "issue": { "custom_fields": [{ "id": 112, "value": "Skin | SK" }], "notes": "…" } }
```

Redmine answers 204 with no body; reading the ticket again is the way to confirm
it landed.
