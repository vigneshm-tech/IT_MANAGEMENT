/**
 * Temporary one-off migration helper: copies schema + data from the Tokyo
 * Supabase project into the new Mumbai project (ljcycazrkqhtmincyowy).
 *
 * Runs during `vercel build` only when MIGRATE_RUN=1, because Vercel build
 * machines can reach both databases while the local sandbox cannot.
 *
 * Safe to re-run: migrations are tracked in public._tt_migrate_log and every
 * row copy uses `on conflict do nothing`.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const RUN = process.env.MIGRATE_RUN === "1";
const REF = process.env.MIGRATE_TARGET_REF || "ljcycazrkqhtmincyowy";
const REGION = process.env.MIGRATE_TARGET_REGION || "ap-south-1";
const PASS = process.env.MIGRATE_TARGET_DB_PASS || "";
const SOURCE_URL = process.env.MIGRATE_SOURCE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SOURCE_KEY = process.env.MIGRATE_SOURCE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!RUN) {
  console.log("[migrate] MIGRATE_RUN is not 1 - skipping");
  process.exit(0);
}

console.log("[migrate] starting", { ref: REF, region: REGION, source: SOURCE_URL });

const candidates = [];
if (process.env.MIGRATE_TARGET_DB_URL) candidates.push(...process.env.MIGRATE_TARGET_DB_URL.split(","));
for (const pooler of [`aws-0-${REGION}.pooler.supabase.com`, `aws-1-${REGION}.pooler.supabase.com`]) {
  for (const port of [5432, 6543]) {
    candidates.push(`postgresql://postgres.${REF}:${encodeURIComponent(PASS)}@${pooler}:${port}/postgres`);
  }
}
candidates.push(`postgresql://postgres:${encodeURIComponent(PASS)}@db.${REF}.supabase.co:5432/postgres`);

async function connect() {
  const errors = [];
  for (const url of candidates) {
    const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
    try {
      await client.connect();
      const { rows } = await client.query("select current_database() as db, current_user as usr, version() as v");
      console.log("[migrate] connected via", url.replace(/:[^:@/]+@/, ":***@"), "->", rows[0].usr);
      return client;
    } catch (err) {
      errors.push(`${url.replace(/:[^:@/]+@/, ":***@")} => ${err.message}`);
      try { await client.end(); } catch {}
    }
  }
  throw new Error(`could not connect to target database:\n${errors.join("\n")}`);
}

const client = await connect();

// ---------------------------------------------------------------- schema
await client.query(`
  create table if not exists public._tt_migrate_log (
    filename text primary key,
    applied_at timestamptz not null default now()
  );
`);

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
const applied = new Set((await client.query("select filename from public._tt_migrate_log")).rows.map((r) => r.filename));
console.log(`[migrate] migrations: ${files.length} files, ${applied.size} already applied`);

for (const file of files) {
  if (applied.has(file)) continue;
  const sql = await readFile(path.join(migrationsDir, file), "utf8");
  try {
    await client.query(sql);
  } catch (err) {
    console.error(`[migrate] FAILED migration ${file}: ${err.message}`);
    throw err;
  }
  await client.query("insert into public._tt_migrate_log(filename) values ($1) on conflict do nothing", [file]);
  console.log(`[migrate] applied ${file}`);
}

const schemaCounts = await client.query(`
  select
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname='public' and c.relkind='r') as tables,
    (select count(*) from pg_policies where schemaname='public') as policies,
    (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f') as functions,
    (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal) as triggers
`);
console.log("[migrate] target schema:", schemaCounts.rows[0]);

// ---------------------------------------------------------------- data
const source = createClient(SOURCE_URL, SOURCE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const { rows: tableRows } = await client.query(`
  select c.relname as name
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relname not like '\\_tt\\_%'
  order by c.relname
`);
const tables = tableRows.map((r) => r.name);
console.log(`[migrate] copying ${tables.length} tables from source`);

const { rows: columnRows } = await client.query(`
  select table_name, column_name
  from information_schema.columns
  where table_schema='public' and is_generated='NEVER'
  order by table_name, ordinal_position
`);
const columnsByTable = new Map();
for (const row of columnRows) {
  if (!columnsByTable.has(row.table_name)) columnsByTable.set(row.table_name, []);
  columnsByTable.get(row.table_name).push(row.column_name);
}

const PAGE = 1000;
const summary = [];
let failures = 0;

if (!SOURCE_URL || !SOURCE_URL.includes("cfzdnykihcajhwvqkybo")) {
  // never wipe the target unless the source really is the Tokyo project
  throw new Error(`refusing to run: unexpected source ${SOURCE_URL}`);
}

await client.query("begin");
await client.query("set local session_replication_role = replica");

// the source is authoritative: drop the migration seed rows in the target so
// production values (edited roles, settings, KB text) win over seed defaults
const truncateList = tables.map((t) => `public."${t}"`).join(", ");
if (truncateList) {
  await client.query(`truncate table ${truncateList} cascade`);
  console.log("[migrate] truncated target tables before copy");
}

for (const table of tables) {
  const cols = columnsByTable.get(table) || [];
  if (!cols.length) continue;
  const colList = cols.map((c) => `"${c}"`).join(", ");
  const insertSql =
    `insert into public."${table}" (${colList}) ` +
    `select ${colList} from json_populate_recordset(null::public."${table}", $1::json) ` +
    `on conflict do nothing`;

  let from = 0;
  let copied = 0;
  try {
    for (;;) {
      const { data, error } = await source.from(table).select("*").range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      await client.query(insertSql, [JSON.stringify(data)]);
      copied += data.length;
      if (data.length < PAGE) break;
      from += PAGE;
    }
    summary.push(`${table}=${copied}`);
  } catch (err) {
    failures += 1;
    console.error(`[migrate] FAILED table ${table}: ${err.message}`);
    summary.push(`${table}=ERROR(${err.message})`);
  }
}

await client.query("commit");

// keep sequences ahead of the copied ids (outside the copy transaction so a
// bad relation can never roll the copy back)
const { rows: seqRows } = await client.query(`
  select s.relname as seq, t.relname as tbl, a.attname as col
  from pg_class s
  join pg_namespace sn on sn.oid = s.relnamespace and sn.nspname = 'public'
  join pg_depend d on d.objid = s.oid and d.classid = 'pg_class'::regclass and d.deptype in ('a','i')
  join pg_class t on t.oid = d.refobjid
  join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
  where s.relkind = 'S'
`);
for (const row of seqRows) {
  try {
    await client.query(
      `select setval('public."${row.seq}"', coalesce((select max("${row.col}") from public."${row.tbl}"), 0) + 1, false)`
    );
  } catch (err) {
    console.error(`[migrate] sequence ${row.seq}: ${err.message}`);
  }
}

console.log("[migrate] row counts:", summary.join(" "));

const { rows: after } = await client.query(`
  select
    (select count(*) from public.iis_applications) as iis,
    (select count(*) from public.monitoring_checks) as checks,
    (select count(*) from public.profiles) as profiles,
    (select count(*) from public.access_roles) as roles,
    (select count(*) from public.app_branding) as branding,
    (select count(*) from public.monitoring_history) as history,
    (select count(*) from public.redmine_clients) as redmine
`);
console.log("[migrate] committed counts:", after[0], "failures:", failures);
await client.end();

if (failures > 0) {
  console.error("[migrate] finished with failures");
  process.exit(1);
}
console.log("[migrate] done");
