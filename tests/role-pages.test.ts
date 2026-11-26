import test from "node:test";
import assert from "node:assert/strict";
import {
  SUB_PAGES,
  allowedPageIds,
  countPages,
  isPageOverride,
  pageIsAllowed,
  pageKey,
  sanitisePageOverrides,
  subPagesFor,
} from "@/lib/roles/pages";
import { clearRoleCatalogue, rolePageFor, setRoleCatalogue } from "@/lib/roles/snapshot";
import { canAccessPage, visiblePageIds } from "@/lib/access";
import { MODULES } from "@/lib/modules";

test("every page names a module that exists and a unique key", () => {
  const moduleIds = new Set(MODULES.map((module) => module.id));
  const keys = new Set<string>();
  for (const [moduleId, pages] of Object.entries(SUB_PAGES)) {
    assert.ok(moduleIds.has(moduleId as never), `${moduleId} is a real module`);
    for (const page of pages ?? []) {
      const key = pageKey(moduleId, page.id);
      assert.equal(keys.has(key), false, `${key} appears once`);
      keys.add(key);
      assert.ok(page.href.startsWith("/modules/"), `${key} has an in-app href`);
      assert.ok(page.label.length > 0, `${key} has a label`);
    }
  }
  assert.equal(subPagesFor("tasks").length, 0, "modules without sub-pages answer empty");
});

test("a page is open unless the module is closed or the page says no", () => {
  assert.equal(pageIsAllowed("none", undefined), false, "no module, no page");
  assert.equal(pageIsAllowed("none", "allow"), false, "a page cannot reopen a closed module");
  assert.equal(pageIsAllowed("read", undefined), true, "a granted module opens its pages");
  assert.equal(pageIsAllowed("write", "allow"), true);
  assert.equal(pageIsAllowed("write", "none"), false, "a closed page stays closed");
  assert.equal(pageIsAllowed("read", "none"), false);
});

test("only real pages and the two answers survive storage", () => {
  assert.equal(isPageOverride("allow"), true);
  assert.equal(isPageOverride("none"), true);
  assert.equal(isPageOverride("read"), false);

  const cleaned = sanitisePageOverrides({
    "settings/email": "none",
    "settings/profile": "allow",
    "settings/nonsense": "none",
    "team/unknown": "allow",
    "users/groups": "maybe",
  });
  assert.deepEqual(cleaned, { "settings/email": "none", "settings/profile": "allow" });

  assert.deepEqual(sanitisePageOverrides(null), {});
  assert.deepEqual(sanitisePageOverrides("nope"), {});
  assert.deepEqual(sanitisePageOverrides([1, 2]), {});
});

test("allowed pages follow the module, and one closed page drops out", () => {
  const settingsPages = subPagesFor("settings").map((page) => page.id);
  assert.deepEqual(allowedPageIds("settings", "write", {}), settingsPages);
  assert.deepEqual(allowedPageIds("settings", "none", {}), [], "a closed module opens nothing");

  const oneClosed = allowedPageIds("settings", "write", { "settings/email": "none" });
  assert.equal(oneClosed.includes("email"), false);
  assert.equal(oneClosed.includes("security"), true);
  assert.equal(oneClosed.length, settingsPages.length - 1);
});

test("countPages counts what is actually open", () => {
  const all = countPages(
    Object.fromEntries(MODULES.map((module) => [module.id, "write"])),
    {},
  );
  const total = Object.values(SUB_PAGES).reduce((sum, pages) => sum + (pages?.length ?? 0), 0);
  assert.equal(all.total, total);
  assert.equal(all.open, total);

  const narrowed = countPages({ settings: "write", users: "none" }, { "settings/email": "none" });
  assert.equal(narrowed.open, subPagesFor("settings").length - 1);
});

test("a saved role can close one page without closing its module", () => {
  clearRoleCatalogue();
  setRoleCatalogue([
    {
      id: "it_manager",
      modules: { settings: "write", monitoring: "write" },
      pages: { "settings/email": "none", "monitoring/settings": "none" },
    },
  ]);

  assert.equal(rolePageFor("it_manager", "settings", "email"), "none");
  assert.equal(rolePageFor("it_manager", "settings", "profile"), undefined);

  assert.equal(canAccessPage("it_manager", "settings", "email"), false);
  assert.equal(canAccessPage("it_manager", "settings", "profile"), true);
  assert.equal(canAccessPage("it_manager", "monitoring", "settings"), false);
  assert.equal(canAccessPage("it_manager", "monitoring", "board"), true);

  const visible = visiblePageIds("it_manager", "settings");
  assert.equal(visible.includes("email"), false);
  assert.equal(visible.includes("security"), true);

  clearRoleCatalogue();
});

test("a module the role cannot open answers no for every page", () => {
  clearRoleCatalogue();
  setRoleCatalogue([{ id: "it_manager", modules: { settings: "none" }, pages: {} }]);

  assert.equal(canAccessPage("it_manager", "settings", "profile"), false);
  assert.deepEqual(visiblePageIds("it_manager", "settings"), []);
  clearRoleCatalogue();
});

test("a built-in role that was never saved keeps every page of its modules", () => {
  clearRoleCatalogue();
  // super_admin sees everything by rule; nothing is closed until somebody says so.
  assert.equal(canAccessPage("super_admin", "settings", "email"), true);
  assert.equal(visiblePageIds("super_admin", "settings").length, subPagesFor("settings").length);
});
