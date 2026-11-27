# Inventory snapshots and the IIS module

Two changes that answer the same complaint: pages waited on somebody else's API,
and there was nowhere to record the applications and databases behind those
servers.

## Action1 data lives in our database

`public.action1_inventory` holds one snapshot per workspace — the endpoint list,
its capture time, and the outcome of the last attempt.

- **Readers** (`loadServersInventory`) answer from the snapshot. Servers,
  Patching, the dashboard and the task form's server picker all go through it, so
  none of them waits on Action1.
- **Writers** are the nightly job (`GET /api/servers/sync`, 03:15 UTC, called by
  Vercel Cron with `Authorization: Bearer $CRON_SECRET`) and the **Sync now**
  button on the Servers page (`syncServersAction`, role-gated to
  `can(role, "servers", "edit")`).
- **The first read after install** has no snapshot, so it fetches once, stores
  the result, and every later read is fast.
- **Stale is not broken.** A snapshot older than 24 hours is flagged in the page
  header rather than blocking. A failed sync records `last_error` and keeps the
  previous snapshot, so a bad minute at Action1 does not empty the page.

The in-process TTL cache (`lib/cache/ttl.ts`) still exists for endpoint detail
and other small reads, but it is no longer what the inventory depends on: a cold
or newly scaled instance now has the same data as a warm one.

`CRON_SECRET` must be set for the job to run at all; the route returns 503
otherwise rather than spending API quota for anyone who finds the URL.

## IIS & Database

A new module (`iis`, under Infrastructure) with three registers:

| Register | Route | Columns |
| --- | --- | --- |
| IIS Application | `/modules/iis/applications` | name, server, environment, app pool, binding, runtime, owner, state, notes |
| Database | `/modules/iis/databases` | name, instance, engine, environment, size, recovery model, last backup, owner, state, notes |
| MySQL | `/modules/iis/mysql` | instance, host, port, version, environment, size, charset/collation, last backup, owner, state, notes |

MySQL is its own register because a MySQL server is administered as a machine —
host, port, version and charset belong to the instance — while the `Database`
register tracks the schemas inside it.

- Overview (`/modules/iis`) summarises all three and lists what needs attention:
  stopped or degraded applications, databases that are not online, MySQL
  instances that are not running, and backups older than seven days.
- Rows are retired rather than deleted by default; delete is behind a
  confirmation panel.
- Access mirrors Servers: `view` for IT, IT engineering and leadership; `edit`
  for IT and IT engineering. The actions re-check the role, so a hidden button is
  not the only guard.
- Migrations: `0033_action1_inventory.sql`, `0034_iis_registers.sql`,
  `0035_iis_mysql.sql`.
