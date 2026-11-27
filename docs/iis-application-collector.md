# IIS applications: the eight fields, and the script that fills them

The IIS Application register used to be a person typing a name and a free-text
"binding". It now holds the eight facts a Windows server can answer about a site,
so the register can be filled by a script instead of by memory.

## The eight fields

| # | Field | Column | Notes |
|---|-------|--------|-------|
| 1 | Server Host Name | `server` | The Windows machine, e.g. `WEB01` |
| 2 | Application Name | `name` | The **IIS site name** — virtual directories are opt-in |
| 3 | Binding Host Name | `binding_host` | The host header; blank when the binding serves any host |
| 4 | Binding Port | `binding_port` | 1–65535, or empty when the server did not report one |
| 5 | SSL Mapped | `ssl_mapped` + `ssl_certificate`, `ssl_thumbprint`, `ssl_expires_at` | Not just "true": which certificate, its thumbprint and the day it lapses |
| 6 | Application Pool | `app_pool` | |
| 7 | Directory Browsing | `directory_browsing` | `disabled` or `enabled` — nothing else |
| 8 | Application Root Path | `app_root` | `physicalPath` on the server |

Around them the register keeps what a person owns: environment, owner, run state
and notes. The script never touches those — it has no opinion about who answers
for an application.

Migrations `0037_iis_application_fields.sql` and `0038_iis_ssl_certificates.sql`
created this shape; `0037` backfilled host, port and SSL out of the old free-text
binding before dropping it, and `0038` added the certificate detail.

## One row per site

A real UAT host in this estate reports **421 applications across a few dozen
sites** — the extra three hundred and eighty are virtual directories and service
endpoints inside nine or ten sites. A register like that is not a register.

So the collector reports **sites** by default: one row per site, named after the
site (`JockeyPOC.eshopaid.com`), with the site's root path, pool, primary binding
and directory-browsing setting. When somebody wants the detailed view, they ask:

```powershell
.\tasktornado-iis-collector.ps1 -ApiKey 'tt_…' -IncludeApplications
```

That adds each application and virtual directory as its own row, named
`Site/Sub/Path`.

## Which certificate is mapped

`SSL Mapped: true` never renewed anything. The collector resolves the certificate
behind every https binding and reports:

- **`ssl_certificate`** — the common name (`*.eshopaid.com`, `portal.example.com`)
- **`ssl_thumbprint`** — the exact certificate, normalised to uppercase hex
- **`ssl_expires_at`** — the day it lapses

It looks in two places, because IIS binds certificates two ways:

1. the site binding's own `certificateHash` (plain https bindings), and
2. `netsh http show sslcert`, keyed by `hostname:port` (SNI bindings live in
   HTTP.sys, not in the site's configuration).

The hash is then read out of `Cert:\LocalMachine\<store>` for the subject and
expiry. When a host reports https but no certificate, the row still says "Mapped"
and the script tells you how many rows that happened to.

## Who may write

Reading and editing the register in the browser follows the module's capability
model: IT management and IT engineering. The **automation endpoint is narrower** —
only a key owned by the **IT manager** or the **super admin** is accepted:

- the `iis:read` / `iis:write` scopes are defined against the module's `admin`
  capability, so no other role can be granted them, and
- the route checks the caller's role explicitly as well, because a key outlives
  the role it was issued under.

## The endpoint

`POST /api/v1/iis/applications` — upsert by application name on the named server.

```json
{
  "server": "JKYUATSRV",
  "environment": "production",
  "applications": [
    {
      "name": "JockeyPOC.eshopaid.com",
      "bindingHost": "jockeypoc.eshopaid.com",
      "bindingPort": 443,
      "sslMapped": true,
      "sslCertificate": "*.eshopaid.com",
      "sslThumbprint": "0123456789ABCDEF0123456789ABCDEF01234567",
      "sslExpiresAt": "2027-03-14",
      "appPool": "JockeyPOC.eshopaid.com",
      "directoryBrowsing": "disabled",
      "appRoot": "D:\\Sites\\JockeyPOC"
    }
  ]
}
```

Response:

```json
{
  "data": {
    "server": "JKYUATSRV",
    "created": 0,
    "updated": 1,
    "unchanged": 348,
    "applications": [{ "id": "…", "name": "JockeyPOC.eshopaid.com", "action": "updated" }]
  },
  "meta": { "count": 349, "created": 0, "updated": 1, "unchanged": 348 }
}
```

- **Idempotent by name.** A second run updates instead of duplicating.
- **`unchanged`** counts rows that were already correct — they are not rewritten,
  so a nightly run over 400 sites costs a handful of writes.
- **Retired rows come back** when the server still reports them.
- **`owner` and `notes` are never overwritten** by a script.
- Up to **1000 applications** per request; the script still posts in batches.
- The response lists the first 50 changes and counts the rest.

`GET /api/v1/iis/applications?server=JKYUATSRV` returns the same shape, for
checking what the register holds before or after a run.

Both are listed in `GET /api/v1` and on Settings › Developers.

## The script

IIS Application → **Collection script** opens a dialog with the API URL for the
host you are looking at, a place to paste a key, and the generated PowerShell 5.1
script — copyable and downloadable as `tasktornado-iis-collector.ps1`.

Run it on the server, in an elevated PowerShell window:

```powershell
.\tasktornado-iis-collector.ps1 -ApiKey 'tt_…' -ListOnly   # see what it finds
.\tasktornado-iis-collector.ps1 -ApiKey 'tt_…'             # then post
```

| Switch | What it does |
|--------|--------------|
| `-ListOnly` | prints the table and sends nothing |
| `-IncludeApplications` | one row per application/virtual directory as well |
| `-AllBindings` | one row per binding instead of one per site |
| `-Environment` | `production`, `staging`, `development`, `dr` |
| `-BatchSize` | rows per request (default 100) |
| `-DumpPath` | also writes the JSON it sends to that file |
| `-ServerHostName` | overrides `$env:COMPUTERNAME` |

The key typed into the dialog is written into the script as the parameter
default, so the file contains a secret: delete it after the run, or leave the
field empty and pass `-ApiKey` each time.

## When the upload fails

The script prints a line per stage — `Collecting`, `Batch 1 of 4: 100
application(s)`, `12 created, 3 updated, 85 unchanged` — so a failure names the
stage instead of raising a bare .NET error.

- `401` — the key was not accepted (revoked, expired, or mistyped).
- `403` — the key's owner is not the IT manager or the super admin.
- `400` — the payload was refused; the message names the field, e.g.
  ``application 1: `bindingPort` must be a whole number 1–65535.``
- A .NET exception *before* the first batch line means collection failed, not the
  network. Re-run with `-ListOnly` to see the table.

`-DumpPath C:\temp\iis.json` writes exactly what was sent, so a failed batch can
be replayed with `curl` while the script is being fixed.

## Files

- `lib/iis/constants.ts` — the record shape, `DIRECTORY_BROWSING`, `describeBinding`, `describeCertificate`
- `lib/iis/automation.ts` — payload parsing and the role allow-list
- `lib/iis/collector.ts` — the PowerShell script generator
- `lib/iis/repository.ts` — `ingestApplications`, the upsert
- `app/api/v1/iis/applications/route.ts` — the endpoint
- `components/modules/iis-collector.tsx` — the dialog and the button
