import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Lock } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { KbArticleForm } from "@/components/modules/kb-article-form";
import { KbCopyLink } from "@/components/modules/kb-copy-link";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { getKbArticle, listKbCategories } from "@/lib/records/repository";
import { updateKbArticleAction, kbArticleRowAction } from "../actions";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const article = await getKbArticle(id);
  return { title: article?.title ?? "Article" };
}

export default async function KbArticlePage({ params }: PageProps) {
  const user = await requireUser();
  if (!canAccessModule(user.role, "kb")) {
    return <AccessDenied moduleTitle="Knowledge base" />;
  }

  const { id } = await params;
  const article = await getKbArticle(id);
  if (!article) notFound();

  const isAgent = can(user.role, "kb", "edit");
  // A non-agent reaching an internal article's URL is a leak, not a 404.
  if (article.visibility === "internal" && !isAgent) notFound();

  const categories = await listKbCategories(true);
  const canEdit = can(user.role, "kb", "edit");

  return (
    <div className="space-y-5">
      <PageHeader
        title={article.title}
        actions={
          <>
            <Link
              href="/modules/kb"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-[12px] font-medium text-navy hover:bg-[#f2f5fa]"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Knowledge base
            </Link>
            {article.visibility === "public" && article.status === "active" && (
              <>
                <KbCopyLink href={`/support/kb/${article.id}`} />
                <Link
                  href={`/support/kb/${article.id}`}
                  target="_blank"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-[12px] font-medium text-navy hover:bg-[#f2f5fa]"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  Public page
                </Link>
              </>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pb-4 text-[11.5px] text-muted">
          <StatusPill status={article.status} label={article.status === "active" ? "Active" : "Inactive"} />
          {article.visibility === "internal" && (
            <span className="inline-flex items-center gap-1 border border-[#e4d6ae] bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-warning">
              <Lock className="h-2.5 w-2.5" aria-hidden /> Internal
            </span>
          )}
          <span>{article.categoryName}</span>
          <span className="font-mono text-[11px]">{article.id}</span>
          <span>Updated {formatDateTime(article.updatedAt)}</span>
        </div>
      </PageHeader>

      <KbArticleForm
        action={updateKbArticleAction}
        categories={categories}
        article={article}
        canEdit={canEdit}
      />

      {canEdit && (
        <div className="flex flex-wrap items-center gap-4 border border-line bg-surface px-4 py-3">
          <form action={kbArticleRowAction}>
            <input type="hidden" name="id" value={article.id} />
            <input type="hidden" name="value" value="toggle" />
            <button
              type="submit"
              className="text-[12px] text-body underline-offset-2 hover:text-navy hover:underline"
            >
              {article.status === "active" ? "Deactivate this article" : "Activate this article"}
            </button>
          </form>
          <form action={kbArticleRowAction}>
            <input type="hidden" name="id" value={article.id} />
            <input type="hidden" name="value" value="delete" />
            <button
              type="submit"
              className="text-[12px] text-danger underline-offset-2 hover:underline"
            >
              Delete
            </button>
          </form>
          <p className="ml-auto text-[11.5px] text-muted">
            Deleting is permanent. Deactivating hides it and keeps the history.
          </p>
        </div>
      )}
    </div>
  );
}
