import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MODULES } from "../lib/modules";

/*
 * The role grid submits one row per module on every save, so the database's
 * check on `access_role_modules.module_id` has to list every module the app can
 * name. It did not: `monitoring` was added to the catalogue after the check was
 * written, and every save failed as a whole while the screen could only say
 * "The permissions could not be saved."
 *
 * This test reads the newest migration that defines the check and compares it
 * with the catalogue, so the next module to arrive fails the build instead of a
 * customer's save.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

const CONSTRAINT_MIGRATION = "0048_role_modules_monitoring.sql";

function moduleConstraint(): string {
  const sql = readFileSync(join(MIGRATIONS, CONSTRAINT_MIGRATION), "utf8");
  const at = sql.indexOf("add constraint access_role_modules_module");
  assert.notEqual(at, -1, `${CONSTRAINT_MIGRATION} no longer defines the module check`);
  return sql.slice(at);
}

test("the module check knows every module the catalogue names", () => {
  const definition = moduleConstraint();
  const listed = [...definition.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
  const catalogue = MODULES.map((module) => module.id).sort();

  assert.deepEqual(
    [...new Set(listed)].sort(),
    catalogue,
    "the module check and lib/modules.ts disagree — add the new module to the check",
  );
});

test("a row for every module in the catalogue is allowed", () => {
  const definition = moduleConstraint();
  for (const module of MODULES) {
    assert.ok(
      definition.includes(`'${module.id}'`),
      `${module.id} cannot be written to access_role_modules`,
    );
  }
});
