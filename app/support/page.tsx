import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, LifeBuoy, Mail, ShieldCheck } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { listPublicKbArticles, listPublicTicketQueues } from "@/lib/records/repository";
import { kbExcerpt } from "@/lib/tickets/kb";

/**
 * Public pages read the live shelf, so they must not be frozen at build time —
 * a build has no session and would bake the fallback in.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Support",
  description: "Raise a ticket with the IT service desk, or find the answer yourself.",
};

export default async function SupportHomePage() {
  const [articles, queues] = await Promise.all([listPublicKbArticles(), listPublicTicketQueues()]);
  const popular = articles.slice(0, 4);

  return (
    <div className="space-y-8">
      <section className="border border-line bg-surface px-5 py-7 sm:px-7 sm:py-9">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gold">IT service desk</p>
        <h1 className="mt-2 font-logo text-[26px] leading-tight text-navy sm:text-[30px]">
          How can we help?
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-body">
          Search the knowledge base, or raise a ticket. No account needed.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/support/new" className={buttonClass({ variant: "primary", size: "md" })}>
            <LifeBuoy className="h-4 w-4" aria-hidden />
            Raise a ticket
          </Link>
          <Link href="/support/kb" className={buttonClass({ variant: "secondary", size: "md" })}>
            <BookOpen className="h-4 w-4" aria-hidden />
            Browse the knowledge base
          </Link>
        </div>
        <p className="mt-4 text-[11.5px] text-muted">
          {queues.length === 0
            ? "The desk is not accepting public tickets right now."
            : `Open to: ${queues.map((queue) => queue.name).join(", ")}.`}
        </p>
      </section>

      <section>
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-[14px] font-semibold text-navy">Frequently asked</h2>
          <Link
            href="/support/kb"
            className="inline-flex items-center gap-1 text-[12px] text-body hover:text-navy"
          >
            All articles
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        <ul className="mt-3 divide-y divide-line border-y border-line bg-surface">
          {popular.map((article) => (
            <li key={article.id}>
              <Link
                href={`/support/kb/${article.id}`}
                className="block px-4 py-3.5 transition-colors hover:bg-[#f4f7fc] sm:px-5"
              >
                <span className="text-[13px] font-medium text-navy">{article.title}</span>
                <span className="mt-1 block text-[12px] leading-relaxed text-muted">
                  {kbExcerpt(article)}
                </span>
              </Link>
            </li>
          ))}
          {popular.length === 0 && (
            <li className="px-4 py-4 text-[12.5px] text-muted sm:px-5">
              No articles published yet.
            </li>
          )}
        </ul>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="border border-line bg-surface px-4 py-4">
          <LifeBuoy className="h-4 w-4 text-navy" aria-hidden />
          <p className="mt-2 text-[12.5px] font-medium text-navy">A ticket number by return</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            You get a reference as soon as you submit.
          </p>
        </div>
        <div className="border border-line bg-surface px-4 py-4">
          <ShieldCheck className="h-4 w-4 text-navy" aria-hidden />
          <p className="mt-2 text-[12.5px] font-medium text-navy">No account needed</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            Just a name and an address.
          </p>
        </div>
        <div className="border border-line bg-surface px-4 py-4">
          <Mail className="h-4 w-4 text-navy" aria-hidden />
          <p className="mt-2 text-[12.5px] font-medium text-navy">Reply by email</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            Keep the ticket number in the subject.
          </p>
        </div>
      </section>
    </div>
  );
}
