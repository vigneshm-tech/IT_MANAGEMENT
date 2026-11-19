import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultPrefs,
  normalisePrefs,
  reconcilePrefs,
  toCsv,
  visibleKeys,
} from "../lib/table-prefs";

const KEYS = ["title", "id", "client", "status"];

test("defaults keep the shipped order and hide only known columns", () => {
  const prefs = defaultPrefs(KEYS, ["client", "gone"], 8);
  assert.deepEqual(prefs.order, KEYS);
  assert.deepEqual(prefs.hidden, ["client"]);
  assert.equal(prefs.pageSize, 8);
  assert.equal(prefs.density, "comfortable");
});

test("stored preferences survive a round trip", () => {
  const stored = {
    order: ["status", "title", "id", "client"],
    hidden: ["id"],
    pageSize: 25,
    density: "compact" as const,
  };
  const prefs = reconcilePrefs(normalisePrefs(stored, defaultPrefs(KEYS)), KEYS);
  assert.deepEqual(prefs.order, ["status", "title", "id", "client"]);
  assert.deepEqual(prefs.hidden, ["id"]);
  assert.equal(prefs.pageSize, 25);
  assert.equal(prefs.density, "compact");
  assert.deepEqual(visibleKeys(prefs), ["status", "title", "client"]);
});

test("columns added in a new build are appended, removed ones dropped", () => {
  const stored = {
    order: ["status", "retired", "title"],
    hidden: ["retired"],
    pageSize: 10,
    density: "comfortable" as const,
  };
  const prefs = reconcilePrefs(normalisePrefs(stored, defaultPrefs(KEYS)), KEYS);
  assert.deepEqual(prefs.order, ["status", "title", "id", "client"]);
  assert.deepEqual(prefs.hidden, []);
});

test("a table can never hide every column", () => {
  const stored = {
    order: [...KEYS],
    hidden: [...KEYS],
    pageSize: 8,
    density: "comfortable" as const,
  };
  const prefs = reconcilePrefs(normalisePrefs(stored, defaultPrefs(KEYS)), KEYS);
  assert.deepEqual(visibleKeys(prefs), [KEYS[0]]);
});

test("junk in storage falls back to the defaults", () => {
  const defaults = defaultPrefs(KEYS, [], 8);
  const prefs = normalisePrefs(
    { order: "nope", hidden: [1, "client"], pageSize: 999, density: "airy" } as never,
    defaults,
  );
  assert.deepEqual(prefs.order, KEYS);
  assert.deepEqual(prefs.hidden, ["client"]);
  assert.equal(prefs.pageSize, 8);
  assert.equal(prefs.density, "comfortable");
});

test("CSV output quotes separators, quotes and newlines", () => {
  const csv = toCsv(
    ["Task", "Notes"],
    [
      ["Patch, ring 2", 'Said "go"'],
      ["Multi\nline", ""],
    ],
  );
  assert.equal(
    csv,
    'Task,Notes\r\n"Patch, ring 2","Said ""go"""\r\n"Multi\nline",',
  );
});
