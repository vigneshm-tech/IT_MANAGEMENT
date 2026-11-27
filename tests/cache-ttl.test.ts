import assert from "node:assert/strict";
import { test } from "node:test";
import { clearCache, readCache, withCache, writeCache } from "../lib/cache/ttl";

test("a value is served from the cache until its window closes", async () => {
  clearCache("test:");
  let calls = 0;
  const load = async () => {
    calls += 1;
    return { n: calls };
  };

  assert.deepEqual(await withCache("test:a", 1_000, load), { n: 1 });
  assert.deepEqual(await withCache("test:a", 1_000, load), { n: 1 });
  assert.equal(calls, 1);
});

test("an expired entry is reloaded", async () => {
  clearCache("test:");
  writeCache("test:b", "old", -1);
  assert.equal(readCache("test:b"), undefined);

  let calls = 0;
  const value = await withCache("test:b", 1_000, async () => {
    calls += 1;
    return "new";
  });
  assert.equal(value, "new");
  assert.equal(calls, 1);
});

test("a null result is never cached, so a dead connection is retried", async () => {
  clearCache("test:");
  let calls = 0;
  const load = async () => {
    calls += 1;
    return null;
  };

  await withCache("test:c", 1_000, load);
  await withCache("test:c", 1_000, load);
  assert.equal(calls, 2);
});

test("clearing by prefix leaves other keys alone", () => {
  clearCache("test:");
  clearCache("other:");
  writeCache("test:one", 1, 5_000);
  writeCache("test:two", 2, 5_000);
  writeCache("other:three", 3, 5_000);

  clearCache("test:");
  assert.equal(readCache("test:one"), undefined);
  assert.equal(readCache("test:two"), undefined);
  assert.equal(readCache("other:three"), 3);
});
