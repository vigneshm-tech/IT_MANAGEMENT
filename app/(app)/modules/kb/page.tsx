import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ExternalLink, Lock, Search } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { KbArticleForm } from "@/components/modules/kb-article-form";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listKbArticles, listKbCategories } from "@/lib/records/repository";
import { kbExcerpt, scoreArticlesForList } from "@/lib/tickets/kb";
import { createKbArticleAction, kbArticleRowAction } from "./actions";

export const metadata: Metadata = { title: "Knowledge base" };

export default async function KbPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const user = await requireUser();
  if (!canAccessModule(user.role, "kb")) {
    return <AccessDenied moduleTitle="Knowledge base" />;
  }

  const { q = "", category = "" } = await searchParams;
  const isAgent = can(user.role, "kb", "edit");
  const canEdit = can(user.role, "kb", "edit");

  const [articles, categories] = await Promise.all([
    listKbArticles({ includeInternal: isAgent, includeInactive: isAgent }),
    listKbCategories(true),
  ]);

  const scoped = category ? articles.filter((article) => article.categoryId === category) : articles;
  const results = scoreArticlesForList(scoped, q);
  const publicCount = articles.filter((article) => article.visibility === "public").length;

  return (
    <div className="space-y-5">
      <PageHeader title="Knowledge base">
        <p className="pb-4 text-[12.5px] text-muted">
          {articles.length} {articles.length === 1 ? "article" : "articles"}, {publicCount} public. Public
          articles are readable at{" "}
          <Link href="/support/kb" className="text-navy underline-offset-2 hover:underline">
            /support/kb
          </Link>{" "}
          without an account.
        </p>
      </PageHeader>

      <form action="/modules/kb" className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search titles, tags and bodies…"
            aria-label="Search articles"
            className="field pl-9"
          />
        </div>
        {category && <input type="hidden" name="category" value={category} />}
        <button
          type="submit"
          className="inline-flex h-9 items-center justify-center rounded-md border border-line-strong bg-surface px-4 text-[13px] font-medium text-navy hover:bg-[#f2f5fa]"
        >
          Search
        </button>
      </form>

      <ul className="flex flex-wrap gap-1.5">
        <li>
          <Link
            href={q ? `/modules/kb?q=${encodeURIComponent(q)}` : "/modules/kb"}
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
          const params = new URLSearchParams({ ...(q ? { q } : {}), category: item.id });
          return (
            <li key={item.id}>
              <Link
                href={`/modules/kb?${params.toString()}`}
                className={
                  category === item.id
                    ? "inline-flex h-7 items-center gap-1 rounded-full border border-navy bg-navy px-3 text-[11.5px] text-white"
                    : "inline-flex h-7 items-center gap-1 rounded-full border border-line px-3 text-[11.5px] text-body hover:border-navy/30 hover:text-navy"
                }
              >
                {item.name}
                {item.status === "inactive" && <span className="text-[10px] opacity-70">(off)</span>}
              </Link>
            </li>
          );
        })}
      </ul>

      {results.length === 0 ? (
        <p className="border border-line bg-surface px-4 py-4 text-[12.5px] text-muted">
          {q ? `Nothing matched “${q}”.` : "No articles yet — write the first one below."}
        </p>
      ) : (
        <ul className="divide-y divide-line border-y border-line bg-surface">
          {results.map((article) => (
            <li key={article.id} className="px-4 py-3.5 sm:px-5">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <Link
                  href={`/modules/kb/${article.id}`}
                  className="text-[13px] font-medium text-navy hover:underline"
                >
                  {article.title}
                </Link>
                <StatusPill
                  status={article.status}
                  label={article.status === "active" ? "Active" : "Inactive"}
                />
                {article.visibility === "internal" ? (
                  <span className="inline-flex items-center gap-1 border border-[#e4d6ae] bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-warning">
                    <Lock className="h-2.5 w-2.5" aria-hidden />
                    Internal
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 border border-line px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                    <BookOpen className="h-2.5 w-2.5" aria-hidden />
                    Public
                  </span>
                )}
                <span className="text-[11px] text-muted">{article.categoryName}</span>
                {article.visibility === "public" && article.status === "active" && (
                  <Link
                    href={`/support/kb/${article.id}`}
                    className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted hover:text-navy"
                  >
                    View public
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </Link>
                )}
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">{kbExcerpt(article)}</p>
              {canEdit && (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <form action={kbArticleRowAction}>
                    <input type="hidden" name="id" value={article.id} />
                    <input type="hidden" name="value" value="toggle" />
                    <button
                      type="submit"
                      className="text-[11.5px] text-body underline-offset-2 hover:text-navy hover:underline"
                    >
                      {article.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                  <Link
                    href={`/modules/kb/${article.id}`}
                    className="text-[11.5px] text-body underline-offset-2 hover:text-navy hover:underline"
                  >
                    Edit
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <section className="space-y-3 pt-2">
          <div>
            <h2 className="text-[13px] font-semibold text-navy">New article</h2>
            <p className="mt-1 text-[12px] text-muted">
              Write the answer once; link it from a reply instead of typing it again.
            </p>
          </div>
          <KbArticleForm
            action={createKbArticleAction}
            categories={categories.filter((item) => item.status === "active")}
            canEdit={canEdit}
          />
        </section>
      )}
    </div>
  );
}
