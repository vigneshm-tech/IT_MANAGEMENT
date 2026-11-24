import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { listKbCategories, listPublicKbArticles } from "@/lib/records/repository";
import { kbExcerpt, searchKbArticles } from "@/lib/tickets/kb";

/** Search reads the live shelf, not a snapshot taken at build time. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Knowledge base",
  description: "Answers from the IT service desk.",
};

export default async function PublicKbPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q = "", category = "" } = await searchParams;
  const [articles, categories] = await Promise.all([listPublicKbArticles(), listKbCategories()]);

  const byCategory = category ? articles.filter((article) => article.categoryId === category) : articles;
  const results = searchKbArticles(byCategory, q, { limit: 50 });
  const searching = q.trim().length > 0;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/support"
          className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-navy"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Support
        </Link>
        <h1 className="mt-2 font-logo text-[24px] leading-tight text-navy">Knowledge base</h1>
        <p className="mt-1.5 text-[12.5px] text-muted">
          {articles.length} {articles.length === 1 ? "article" : "articles"} from the desk.
        </p>
      </div>

      <form action="/support/kb" className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search articles — vpn, password, printer…"
            aria-label="Search the knowledge base"
            className="field pl-9"
          />
        </div>
        {category && <input type="hidden" name="category" value={category} />}
        <button
          type="submit"
          className="inline-flex h-9 items-center justify-center rounded-md bg-gold px-4 text-[13px] font-semibold text-navy hover:bg-[#bb9c5e]"
        >
          Search
        </button>
      </form>

      <ul className="flex flex-wrap gap-1.5">
        <li>
          <Link
            href={q ? `/support/kb?q=${encodeURIComponent(q)}` : "/support/kb"}
            className={
              category
                ? "inline-flex h-7 items-center rounded-full border border-line px-3 text-[11.5px] text-body hover:border-navy/30 hover:text-navy"
                : "inline-flex h-7 items-center rounded-full border border-navy bg-navy px-3 text-[11.5px] text-white"
            }
          >
            All
          </Link>
        </li>
        {categories.map((item) => {
          const href = `/support/kb?${new URLSearchParams({
            ...(q ? { q } : {}),
            category: item.id,
          }).toString()}`;
          return (
            <li key={item.id}>
              <Link
                href={href}
                className={
                  category === item.id
                    ? "inline-flex h-7 items-center rounded-full border border-navy bg-navy px-3 text-[11.5px] text-white"
                    : "inline-flex h-7 items-center rounded-full border border-line px-3 text-[11.5px] text-body hover:border-navy/30 hover:text-navy"
                }
              >
                {item.name}
              </Link>
            </li>
          );
        })}
      </ul>

      {results.length === 0 ? (
        <div className="border border-line bg-surface px-5 py-6">
          <p className="text-[13px] text-body">
            {searching ? `Nothing matched “${q}”.` : "No articles here yet."}
          </p>
          <p className="mt-1.5 text-[12px] text-muted">
            Raise a ticket and the desk will answer.
          </p>
          <Link
            href="/support/new"
            className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-navy hover:underline"
          >
            Raise a ticket
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-line border-y border-line bg-surface">
          {results.map((article) => (
            <li key={article.id}>
              <Link
                href={`/support/kb/${article.id}`}
                className="block px-4 py-3.5 transition-colors hover:bg-[#f4f7fc] sm:px-5"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[13px] font-medium text-navy">{article.title}</span>
                  {article.categoryName && (
                    <span className="rounded-full border border-line px-2 py-0.5 text-[10.5px] uppercase tracking-[0.08em] text-muted">
                      {article.categoryName}
                    </span>
                  )}
                </div>
                <span className="mt-1 block text-[12px] leading-relaxed text-muted">
                  {kbExcerpt(article)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
