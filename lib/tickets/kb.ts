/**
 * The knowledge base, in the open.
 *
 * Zammad's KB has categories, public and internal articles, and search that
 * agents and requesters share. Ours does the same and leans on one rule: an
 * article is either **public** (a requester may read it and an agent may link it
 * in a reply) or **internal** (agents only, never linked outward). Search is a
 * scored match over the title, summary and body rather than a database full-text
 * index, because a service desk has hundreds of articles, not millions — and a
 * score we control is a score we can test.
 */

export type KbVisibility = "public" | "internal";

export type KbArticleLike = {
  id: string;
  title: string;
  summary: string;
  body: string;
  visibility: KbVisibility | string;
  status: "active" | "inactive" | string;
  categoryId: string;
  tags: string[];
};

export type KbCategoryLike = {
  id: string;
  name: string;
  status: "active" | "inactive" | string;
};

export const KB_TITLE_MIN = 4;
export const KB_TITLE_MAX = 120;
export const KB_SUMMARY_MAX = 240;
export const KB_BODY_MAX = 20000;
export const KB_EXCERPT = 180;

export const KB_VISIBILITIES: { id: KbVisibility; label: string; hint: string }[] = [
  {
    id: "public",
    label: "Public",
    hint: "Anyone can read it at /support/kb, and an agent can link it in a reply.",
  },
  {
    id: "internal",
    label: "Internal",
    hint: "Agents only. It never appears on the public site or in an outbound reply.",
  },
];

export function isKbVisibility(value: string): value is KbVisibility {
  return value === "public" || value === "internal";
}

/** "Reset the VPN client" → "reset-the-vpn-client". */
export function kbSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** The first free slug: the bare slug, then `-2`, `-3`… */
export function freeKbSlug(raw: string, taken: { id: string }[] = []): string {
  const base = kbSlug(raw) || "article";
  const used = new Set(taken.map((item) => item.id.toLowerCase()));
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 500; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export function normaliseKbTitle(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function kbArticleError(input: {
  title: string;
  body: string;
  categoryId: string;
  categories?: KbCategoryLike[];
}): string | null {
  const title = normaliseKbTitle(input.title);
  if (title.length < KB_TITLE_MIN) return `Give the article a title of at least ${KB_TITLE_MIN} characters.`;
  if (title.length > KB_TITLE_MAX) return `Keep the title under ${KB_TITLE_MAX} characters.`;
  if (!input.categoryId) return "Pick a category for the article.";
  if (
    input.categories &&
    !input.categories.some((category) => category.id === input.categoryId && category.status === "active")
  ) {
    return "That category is not available. Pick another one.";
  }
  if (input.body.trim().length < 20) return "Write the article — at least 20 characters of steps or explanation.";
  if (input.body.length > KB_BODY_MAX) return `Keep the article under ${KB_BODY_MAX} characters.`;
  return null;
}

export function kbCategoryError(raw: string, existing: { id: string; name: string }[] = []): string | null {
  const name = normaliseKbTitle(raw);
  if (name.length < 3) return "Give the category a name of at least 3 characters.";
  if (name.length > 60) return "Keep the category name under 60 characters.";
  if (existing.some((item) => item.name.trim().toLowerCase() === name.toLowerCase())) {
    return `"${name}" is already a category.`;
  }
  return null;
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "have", "has", "not", "are", "was",
  "were", "you", "your", "our", "can", "cannot", "does", "did", "how", "why", "what", "when",
  "where", "who", "will", "would", "should", "could", "any", "all", "but", "into", "about",
  "there", "their", "them", "then", "than", "been", "being", "just", "still", "again", "every",
]);

/** Lowercase words worth matching on: three letters or more, no filler. */
export function kbTerms(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^-+|-+$/g, ""))
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

function scoreArticle(article: KbArticleLike, terms: string[], phrase: string): number {
  if (terms.length === 0) return 0;

  const title = article.title.toLowerCase();
  const summary = article.summary.toLowerCase();
  const body = article.body.toLowerCase();
  const tags = article.tags.map((tag) => tag.toLowerCase());

  let score = 0;
  if (phrase.length >= 4 && title.includes(phrase)) score += 40;
  for (const term of terms) {
    if (title.includes(term)) score += 10;
    if (tags.some((tag) => tag === term)) score += 8;
    else if (tags.some((tag) => tag.includes(term))) score += 4;
    if (summary.includes(term)) score += 3;
    if (body.includes(term)) score += 1;
  }
  return score;
}

export type KbSearchOptions = {
  /** Include internal articles — only when the caller is an agent. */
  includeInternal?: boolean;
  includeInactive?: boolean;
  categoryId?: string;
  limit?: number;
};

/**
 * Ranked matches, best first. An empty query lists the newest-first order the
 * caller passed in, which is what a browse view wants.
 */
export function searchKbArticles<T extends KbArticleLike>(
  articles: T[],
  query: string,
  options: KbSearchOptions = {},
): T[] {
  const limit = Math.max(1, Math.min(100, options.limit ?? 20));
  const visible = articles.filter((article) => {
    if (!options.includeInactive && article.status !== "active") return false;
    if (!options.includeInternal && article.visibility !== "public") return false;
    if (options.categoryId && article.categoryId !== options.categoryId) return false;
    return true;
  });

  const terms = kbTerms(query);
  const phrase = query.toLowerCase().replace(/\s+/g, " ").trim();
  if (terms.length === 0) return visible.slice(0, limit);

  return visible
    .map((article) => ({ article, score: scoreArticle(article, terms, phrase) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title))
    .slice(0, limit)
    .map((row) => row.article);
}

/**
 * What to offer an agent while they are replying: the articles that read most
 * like this ticket. Two terms must land, so a ticket mentioning "the" does not
 * drag the whole KB in.
 */
export function suggestKbArticles<T extends KbArticleLike>(
  articles: T[],
  text: string,
  options: KbSearchOptions = {},
): T[] {
  const terms = kbTerms(text);
  if (terms.length === 0) return [];

  return articles
    .filter((article) => {
      if (article.status !== "active") return false;
      if (!options.includeInternal && article.visibility !== "public") return false;
      const haystack = [article.title, article.summary, article.body, ...article.tags]
        .join(" ")
        .toLowerCase();
      const hits = terms.filter((term) => haystack.includes(term)).length;
      return hits >= Math.min(2, terms.length);
    })
    .map((article) => ({ article, score: scoreArticle(article, terms, text.toLowerCase()) }))
    .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title))
    .slice(0, options.limit ?? 3)
    .map((row) => row.article);
}

/**
 * The agent list view: ranked when there is a query, alphabetical when there is
 * not. Unlike a public search it keeps internal and inactive articles, because
 * the agent needs to find the draft they started yesterday.
 */
export function scoreArticlesForList<T extends KbArticleLike>(articles: T[], query: string): T[] {
  if (!query.trim()) return [...articles].sort((a, b) => a.title.localeCompare(b.title));
  return searchKbArticles(articles, query, {
    includeInternal: true,
    includeInactive: true,
    limit: 100,
  });
}

/** A one-line taste of the body, for a list that cannot show all of it. */
export function kbExcerpt(article: { summary: string; body: string }): string {
  const source = article.summary.trim() || article.body.replace(/\s+/g, " ").trim();
  if (source.length <= KB_EXCERPT) return source;
  return `${source.slice(0, KB_EXCERPT).replace(/[\s,.;:-]+$/, "")}…`;
}

/** Articles a visitor may read: active, public, in an active category. */
export function publicKbArticles<T extends KbArticleLike>(
  articles: T[],
  categories: KbCategoryLike[],
): T[] {
  const live = new Set(
    categories.filter((category) => category.status === "active").map((category) => category.id),
  );
  return articles.filter(
    (article) => article.status === "active" && article.visibility === "public" && live.has(article.categoryId),
  );
}

/* Seed data ---------------------------------------------------------------- */

export type KbCategorySeed = {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
};

export const KB_SEED_CATEGORIES: KbCategorySeed[] = [
  { id: "getting-started", name: "Getting started", description: "How the service desk works and what to expect", sortOrder: 10 },
  { id: "network", name: "Network and VPN", description: "Connectivity, Wi-Fi, VPN and the office link", sortOrder: 20 },
  { id: "accounts", name: "Accounts and access", description: "Passwords, MFA, mailboxes and permissions", sortOrder: 30 },
  { id: "devices", name: "Laptops and devices", description: "Setup, printing and hardware", sortOrder: 40 },
  { id: "security", name: "Security", description: "Phishing, incidents and access reviews", sortOrder: 50 },
];

export type KbArticleSeed = {
  id: string;
  categoryId: string;
  title: string;
  summary: string;
  body: string;
  visibility: KbVisibility;
  tags: string[];
  sortOrder: number;
};

/** The same shelf the migration seeds, so a preview without Supabase reads the same. */
export const KB_SEED_ARTICLES: KbArticleSeed[] = [
  {
    id: "vpn-keeps-dropping",
    categoryId: "network",
    title: "The VPN keeps dropping",
    summary: "What to try before raising a ticket, and what we need from you if it still drops.",
    body:
      "Reconnect once before anything else: disconnect the client completely, restart the machine, then reconnect and note the time it drops again.\n\nIf it still drops, reply with:\n\n1. the time it dropped;\n2. whether the wired connection stays up;\n3. whether others on your floor see it too.\n\nWe keep a carrier ticket open for the Chennai circuit, so a timestamp is the fastest way for us to join your report to it.",
    visibility: "public",
    tags: ["vpn", "network", "reconnect"],
    sortOrder: 10,
  },
  {
    id: "reset-your-password",
    categoryId: "accounts",
    title: "Reset your password",
    summary: "Reset it yourself in two minutes, and what to do if MFA is the problem.",
    body:
      "Use the sign-in page and choose \"Forgot password\". The reset link goes to your mailbox and is valid for one hour.\n\nIf you cannot get past the second factor, do not raise a password ticket — raise one for MFA and tell us which phone or app you registered with. Resetting a password does not reset the second factor, and that is usually the real problem.",
    visibility: "public",
    tags: ["password", "reset", "mfa", "access"],
    sortOrder: 20,
  },
  {
    id: "new-laptop-setup",
    categoryId: "devices",
    title: "Set up a new laptop",
    summary: "What is already installed, what you need to do on day one, and how long it takes.",
    body:
      "New laptops arrive imaged: Windows or macOS, the VPN client, the endpoint agent and the standard Office suite. Sign in with your work account and the rest installs itself.\n\nOn day one:\n\n1. sign in and let the endpoint agent check in (it takes about ten minutes);\n2. connect the VPN once, so we know the profile works;\n3. enrol MFA if you are new.\n\nRaise a ticket if the endpoint agent has not checked in after an hour.",
    visibility: "public",
    tags: ["laptop", "onboarding", "setup", "device"],
    sortOrder: 30,
  },
  {
    id: "report-a-phishing-email",
    categoryId: "security",
    title: "Report a phishing email",
    summary: "Where to send it, and why forwarding it to a colleague is the wrong move.",
    body:
      "Forward the message as an attachment to the security queue, or raise a ticket with the sender and subject. Do not click links, and do not forward it to colleagues to ask if it looks real — that spreads it.\n\nIf you already entered credentials, say so in the ticket. We will reset the password and revoke sessions, and that is much faster than finding out a week later.",
    visibility: "public",
    tags: ["phishing", "email", "security", "spam"],
    sortOrder: 40,
  },
  {
    id: "clear-a-printer-jam",
    categoryId: "devices",
    title: "Clear a printer jam",
    summary: "The two panels to open, and the one thing not to pull.",
    body:
      "Open the front cover, then the rear duplex panel. Pull the sheet in the direction it was travelling — pulling backwards tears it and leaves a scrap in the sensor.\n\nIf the display still shows a jam, power the printer off for thirty seconds. A jam that returns on the same tray is a hardware fault; raise a ticket with the tray number.",
    visibility: "public",
    tags: ["printer", "paper", "hardware"],
    sortOrder: 50,
  },
  {
    id: "support-escalation-matrix",
    categoryId: "getting-started",
    title: "Support escalation matrix",
    summary: "Internal: who owns a queue, and when to escalate rather than sit on it.",
    body:
      "Service desk owns everyday requests. Infrastructure owns the office link, servers and patching. Applications owns the business systems. Security owns phishing, incidents and access reviews.\n\nEscalate to the IT manager when:\n\n- a ticket breaches its first-response target twice in one day;\n- more than one person reports the same outage;\n- the requester is leadership or a client contact.\n\nNever leave a ticket in Pending without a reminder date: the sweep closes it after seven days.",
    visibility: "internal",
    tags: ["escalation", "sla", "priority", "internal"],
    sortOrder: 60,
  },
  {
    id: "mailbox-quota-and-archives",
    categoryId: "accounts",
    title: "Mailbox quota and archives",
    summary: "Internal: how the 50 GB quota is enforced and how archives are requested.",
    body:
      "Mailboxes are capped at 50 GB. At 90% the user gets a warning; at 100% sending stops but receiving continues for seven days.\n\nAsk the user to empty Deleted Items and Sent Items first — that reclaims about a fifth in practice. Archive requests go to the IT manager with the mailbox address and the retention period; archives are exported as PST and kept for thirty days before deletion.",
    visibility: "internal",
    tags: ["mailbox", "quota", "archive", "internal"],
    sortOrder: 70,
  },
];
