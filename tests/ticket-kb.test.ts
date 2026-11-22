import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KB_BODY_MAX,
  KB_SEED_ARTICLES,
  KB_SEED_CATEGORIES,
  freeKbSlug,
  kbArticleError,
  kbCategoryError,
  kbExcerpt,
  kbSlug,
  kbTerms,
  normaliseKbTitle,
  publicKbArticles,
  scoreArticlesForList,
  searchKbArticles,
  suggestKbArticles,
  type KbArticleLike,
} from "../lib/tickets/kb";

const article = (overrides: Partial<KbArticleLike> & { id: string }): KbArticleLike => ({
  title: "Reset your password",
  summary: "Reset it yourself in two minutes.",
  body: "Use the sign-in page and choose forgot password.",
  visibility: "public",
  status: "active",
  categoryId: "accounts",
  tags: ["password", "mfa"],
  ...overrides,
});

test("a title becomes a slug, and a taken slug gets the next number", () => {
  assert.equal(kbSlug("Reset the VPN client!"), "reset-the-vpn-client");
  assert.equal(kbSlug("  Café — crème  "), "cafe-creme");
  assert.equal(kbSlug("!!!"), "");
  assert.equal(freeKbSlug("Reset the VPN", []), "reset-the-vpn");
  assert.equal(freeKbSlug("Reset the VPN", [{ id: "reset-the-vpn" }]), "reset-the-vpn-2");
  assert.equal(
    freeKbSlug("Reset the VPN", [{ id: "reset-the-vpn" }, { id: "reset-the-vpn-2" }]),
    "reset-the-vpn-3",
  );
  assert.equal(freeKbSlug("!!!", []), "article");
});

test("titles are collapsed but not case-folded", () => {
  assert.equal(normaliseKbTitle("  VPN   keeps\n\ndropping "), "VPN keeps dropping");
});

test("an article needs a title, a live category and a body", () => {
  const categories = KB_SEED_CATEGORIES.map((item) => ({ id: item.id, name: item.name, status: "active" }));
  assert.equal(
    kbArticleError({
      title: "VPN drops",
      body: "Long enough body for the rule.",
      categoryId: "network",
      categories,
    }),
    null,
  );
  assert.match(
    kbArticleError({ title: "VPN drops", body: "Long enough body for the rule.", categoryId: "", categories }) ??
      "",
    /Pick a category/,
  );
  assert.match(
    kbArticleError({
      title: "VPN drops",
      body: "Long enough body for the rule.",
      categoryId: "nope",
      categories,
    }) ?? "",
    /not available/,
  );
  assert.match(
    kbArticleError({ title: "VPN drops", body: "too short", categoryId: "network", categories }) ?? "",
    /at least 20 characters/,
  );
  assert.match(
    kbArticleError({
      title: "VPN drops",
      body: "x".repeat(KB_BODY_MAX + 1),
      categoryId: "network",
      categories,
    }) ?? "",
    /Keep the article under/,
  );
});

test("a category name is unique and neither too short nor too long", () => {
  assert.equal(kbCategoryError("Printing", []), null);
  assert.match(kbCategoryError("ab", []) ?? "", /at least 3 characters/);
  assert.match(kbCategoryError("x".repeat(61), []) ?? "", /under 60 characters/);
  assert.match(
    kbCategoryError("network", [{ id: "network", name: "Network" }]) ?? "",
    /already a category/,
  );
});

test("terms drop filler words and short words", () => {
  assert.deepEqual(kbTerms("The VPN is not working for me"), ["vpn", "working"]);
  assert.deepEqual(kbTerms(""), []);
});

test("search ranks a title match above a body mention", () => {
  const articles = [
    article({ id: "body-only", title: "Mailbox size", body: "Your password expires soon." , tags: [] }),
    article({ id: "title-hit", title: "Reset your password", body: "Use the reset link." }),
  ];
  const results = searchKbArticles(articles, "password");
  assert.deepEqual(
    results.map((item) => item.id),
    ["title-hit", "body-only"],
  );
});

test("a public search never returns an internal or inactive article", () => {
  const articles = [
    article({ id: "public-one" }),
    article({ id: "internal-one", visibility: "internal" }),
    article({ id: "draft-one", status: "inactive" }),
  ];
  assert.deepEqual(
    searchKbArticles(articles, "password").map((item) => item.id),
    ["public-one"],
  );
  assert.deepEqual(
    searchKbArticles(articles, "password", { includeInternal: true, includeInactive: true }).map(
      (item) => item.id,
    ),
    ["public-one", "internal-one", "draft-one"],
  );
});

test("an empty query lists the shelf instead of ranking it", () => {
  const articles = [article({ id: "b", title: "Bravo" }), article({ id: "a", title: "Alpha" })];
  assert.deepEqual(
    searchKbArticles(articles, "   ").map((item) => item.id),
    ["b", "a"],
  );
  assert.deepEqual(
    scoreArticlesForList(articles, "").map((item) => item.id),
    ["a", "b"],
  );
});

test("a suggestion needs two terms to land", () => {
  const articles = [
    article({ id: "strong", title: "VPN keeps dropping", summary: "Reconnect and note the time.", tags: ["vpn"] }),
    article({ id: "weak", title: "Printer jam", summary: "Open the duplex panel.", tags: ["printer"] }),
  ];
  const suggested = suggestKbArticles(articles, "the vpn keeps dropping on the chennai link");
  assert.deepEqual(
    suggested.map((item) => item.id),
    ["strong"],
  );
  assert.deepEqual(suggestKbArticles(articles, "the"), []);
});

test("publicKbArticles hides internal articles and dead categories", () => {
  const categories = [
    { id: "accounts", name: "Accounts", status: "active" },
    { id: "retired", name: "Retired", status: "inactive" },
  ];
  const articles = [
    article({ id: "live" }),
    article({ id: "internal", visibility: "internal" }),
    article({ id: "orphan", categoryId: "retired" }),
  ];
  assert.deepEqual(
    publicKbArticles(articles, categories).map((item) => item.id),
    ["live"],
  );
});

test("an excerpt falls back to the body and marks its cut", () => {
  assert.equal(kbExcerpt({ summary: "Short summary", body: "ignored" }), "Short summary");
  const long = kbExcerpt({ summary: "", body: "word ".repeat(60) });
  assert.ok(long.length <= 181);
  assert.ok(long.endsWith("…"));
});

test("the seed shelf is coherent: every article has a category, and two are internal", () => {
  const ids = new Set(KB_SEED_CATEGORIES.map((category) => category.id));
  for (const seed of KB_SEED_ARTICLES) {
    assert.ok(ids.has(seed.categoryId), `${seed.id} points at ${seed.categoryId}`);
    assert.equal(kbArticleError({ title: seed.title, body: seed.body, categoryId: seed.categoryId }), null);
  }
  assert.equal(KB_SEED_ARTICLES.filter((seed) => seed.visibility === "internal").length, 2);
  assert.equal(KB_SEED_ARTICLES.filter((seed) => seed.visibility === "public").length, 5);
});
