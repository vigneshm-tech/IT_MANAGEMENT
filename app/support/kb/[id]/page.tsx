import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, LifeBuoy } from "lucide-react";
import { getKbArticle, listPublicKbArticles } from "@/lib/records/repository";
import { kbExcerpt } from "@/lib/tickets/kb";

/** An internal article must never be baked into a static page. */
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const article = await getKbArticle(id);
  if (!article || article.visibility !== "public" || article.status !== "active") {
    return { title: "Article" };
  }
  return { title: article.title, description: kbExcerpt(article) };
}

export default async function PublicKbArticlePage({ params }: PageProps) {
  const { id } = await params;
  const article = await getKbArticle(id);

  // Internal and inactive articles are invisible here, not merely unlinked.
  if (!article || article.visibility !== "public" || article.status !== "active") notFound();

  const related = (await listPublicKbArticles())
    .filter((item) => item.categoryId === article.categoryId && item.id !== article.id)
    .slice(0, 3);

  return (
    <article className="space-y-5">
      <div>
        <Link
          href="/support/kb"
          className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-navy"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Knowledge base
        </Link>
        <p className="mt-3 text-[10.5px] font-medium uppercase tracking-[0.14em] text-gold">
          {article.categoryName || "Article"}
        </p>
        <h1 className="mt-1.5 font-logo text-[24px] leading-tight text-navy">{article.title}</h1>
        {article.summary && (
          <p className="mt-2 text-[13px] leading-relaxed text-body">{article.summary}</p>
        )}
      </div>

      <div className="border border-line bg-surface px-5 py-5 sm:px-6">
        {article.body.split(/\n{2,}/).map((block, index) => {
          const lines = block.split("\n").filter((line) => line.trim().length > 0);
          const list = lines.length > 1 && lines.every((line) => /^\s*(\d+\.|[-*])\s+/.test(line));
          if (list) {
            const ordered = /^\s*\d+\./.test(lines[0]);
            const items = lines.map((line) => line.replace(/^\s*(\d+\.|[-*])\s+/, ""));
            const List = ordered ? "ol" : "ul";
            return (
              <List
                key={index}
                className={
                  ordered
                    ? "my-3 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-body"
                    : "my-3 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-body"
                }
              >
                {items.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </List>
            );
          }
          return (
            <p key={index} className="my-3 text-[13px] leading-relaxed text-body first:mt-0 last:mb-0">
              {block.replace(/\n/g, " ")}
            </p>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface px-4 py-3">
        <p className="flex items-center gap-2 text-[12px] text-muted">
          <LifeBuoy className="h-3.5 w-3.5 text-navy" aria-hidden />
          Still stuck? The desk answers in office hours.
        </p>
        <Link
          href="/support/new"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-navy hover:underline"
        >
          Raise a ticket
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {related.length > 0 && (
        <section>
          <h2 className="text-[13px] font-semibold text-navy">More in {article.categoryName}</h2>
          <ul className="mt-2 divide-y divide-line border-y border-line bg-surface">
            {related.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/support/kb/${item.id}`}
                  className="block px-4 py-3 transition-colors hover:bg-[#f4f7fc] sm:px-5"
                >
                  <span className="text-[12.5px] font-medium text-navy">{item.title}</span>
                  <span className="mt-0.5 block text-[11.5px] text-muted">{kbExcerpt(item)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
