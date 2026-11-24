# IIS applications: the eight fields, and the script that fills them

The IIS Application register used to be a person typing a name and a free-text
"binding". It now holds the eight facts a Windows server can answer about a site,
so the register can be filled by a script instead of by memory.

## The eight fields

| # | Field | Column | Notes |
|---|-------|--------|-------|
| 1 | Server Host Name | `server` | The Windows machine, e.g. `WEB01` |
| 2 | Application Name | `name` | The IIS site, plus the path for a nested application |
| 3 | Binding Host Name | `binding_host` | The host header; blank when the binding serves any host |
| 4 | Binding Port | `binding_port` | 1–65535, or empty when the server did not report one |
| 5 | SSL Mapped | `ssl_mapped` | The binding's protocol is `https` |
| 6 | Application Pool | `app_pool` | |
| 7 | Directory Browsing | `directory_browsing` | `disabled` or `enabled` — nothing else |
| 8 | Application Root Path | `app_root` | `physicalPath` on the server |

Around them the register keeps what a person owns: environment, owner, run state
and notes. The script never touches those — it has no opinion about who answers
for an application.

The old `binding` and `framework` columns were retired by migration
`0037_iis_application_fields.sql`, which backfilled host, port and SSL out of the
free-text binding before dropping it.

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
  "server": "WEB01",
  "environment": "production",
  "applications": [
    {
      "name": "Portal",
      "bindingHost": "portal.example.com",
      "bindingPort": 443,
      "sslMapped": true,
      "appPool": "PortalPool",
      "directoryBrowsing": "disabled",
      "appRoot": "C:\\inetpub\\portal"
    }
  ]
}
```

Response:

```json
{
  "data": {
    "server": "WEB01",
    "created": 1,
    "updated": 0,
    "applications": [{ "id": "…", "name": "Portal", "action": "created" }]
  },
  "meta": { "count": 1 }
}
```

A second run with the same body updates instead of duplicating. A retired row
that the server still reports comes back to life — the machine just proved the
application is there. `owner` and `notes` are never overwritten.

`GET /api/v1/iis/applications?server=WEB01` returns the same shape, for checking
what the register holds before or after a run.

Both are listed in `GET /api/v1` and on Settings › Developers.

## The script

IIS Application → **Collection script** opens a dialog with the API URL for the
host you are looking at, a place to paste a key, and the generated PowerShell 5.1
script — copyable and downloadable as `tasktornado-iis-collector.ps1`.

Run it on the server, in an elevated PowerShell window:

```powershell
.\tasktornado-iis-collector.ps1 -ApiKey 'tt_…'
```

- `-ListOnly` prints the table and sends nothing.
- `-AllBindings` reports one row per binding (named `Site (host:port)`) instead
  of one row per application, which is the default and uses the https binding
  when the site has one.
- `-Environment staging|development|dr` files the rows in that environment.
- `-ServerHostName` overrides `$env:COMPUTERNAME`.

The key typed into the dialog is written into the script as the parameter
default, so the file contains a secret: delete it after the run, or leave the
field empty and pass `-ApiKey` each time.

## Files

- `lib/iis/constants.ts` — the record shape, `DIRECTORY_BROWSING`, `describeBinding`
- `lib/iis/automation.ts` — payload parsing and the role allow-list
- `lib/iis/collector.ts` — the PowerShell script generator
- `lib/iis/repository.ts` — `ingestApplications`, the upsert
- `app/api/v1/iis/applications/route.ts` — the endpoint
- `components/modules/iis-collector.tsx` — the dialog and the button
