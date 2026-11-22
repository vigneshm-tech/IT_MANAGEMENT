import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { KbCategoryForm } from "@/components/modules/kb-category-form";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listKbArticles, listKbCategories } from "@/lib/records/repository";
import { addKbCategoryAction, kbCategoryRowAction } from "./actions";

export const metadata: Metadata = { title: "KB categories" };

export default async function KbCategoriesPage() {
  const user = await requireUser();
  if (!canAccessModule(user.role, "masters")) {
    return <AccessDenied moduleTitle="Masters" />;
  }

  const [categories, articles] = await Promise.all([
    listKbCategories(true),
    listKbArticles({ includeInternal: true, includeInactive: true }),
  ]);
  const canEdit = can(user.role, "masters", "edit");

  const counts = new Map<string, { total: number; public: number }>();
  for (const article of articles) {
    const entry = counts.get(article.categoryId) ?? { total: 0, public: 0 };
    entry.total += 1;
    if (article.visibility === "public") entry.public += 1;
    counts.set(article.categoryId, entry);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="KB categories"
        actions={
          <Link href="/modules/masters" className={buttonClass({ variant: "secondary", size: "sm" })}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Masters
          </Link>
        }
      >
        <p className="pb-4 text-[12.5px] text-muted">
          The shelves behind{" "}
          <Link href="/modules/kb" className="text-navy underline-offset-2 hover:underline">
            the knowledge base
          </Link>
          . A category with articles in it is deactivated, never deleted.
        </p>
      </PageHeader>

      {canEdit ? (
        <KbCategoryForm action={addKbCategoryAction} />
      ) : (
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          Your role can read the categories but not change them.
        </p>
      )}

      <ul className="divide-y divide-line border-y border-line bg-surface">
        {categories.map((category) => {
          const entry = counts.get(category.id) ?? { total: 0, public: 0 };
          return (
            <li key={category.id} className="px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-navy">
                  <BookOpen className="h-3.5 w-3.5 text-muted" aria-hidden />
                  {category.name}
                </span>
                <StatusPill
                  status={category.status}
                  label={category.status === "active" ? "Active" : "Inactive"}
                />
                <span className="ml-auto font-mono text-[11px] text-muted">{category.id}</span>
              </div>
              {category.description && (
                <p className="mt-1 text-[12px] text-muted">{category.description}</p>
              )}
              <p className="mt-1 text-[11.5px] text-muted">
                {entry.total} {entry.total === 1 ? "article" : "articles"} · {entry.public} public
              </p>
              {canEdit && (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <form action={kbCategoryRowAction}>
                    <input type="hidden" name="id" value={category.id} />
                    <input type="hidden" name="value" value="toggle" />
                    <button
                      type="submit"
                      className="text-[11.5px] text-body underline-offset-2 hover:text-navy hover:underline"
                    >
                      {category.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                  {entry.total > 0 && (
                    <span className="text-[11px] text-muted">
                      Move its articles before removing it
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {categories.length === 0 && (
          <li className="px-4 py-4 text-[12.5px] text-muted sm:px-5">No categories yet.</li>
        )}
      </ul>
    </div>
  );
}
