import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { KbCategoryForm } from "@/components/modules/kb-category-form";
import { TicketAdminTabs } from "@/components/modules/ticket-admin-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listKbArticles, listKbCategories } from "@/lib/records/repository";
import { canConfigureTickets, canReadTicketAdmin } from "@/lib/tickets/admin";
import { kbCategoryRowAction, saveKbCategoryAction } from "./actions";

export const metadata: Metadata = { title: "KB categories" };

export default async function TicketKbCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; delete?: string; blocked?: string }>;
}) {
  const user = await requireUser();
  if (!canAccessModule(user.role, "tickets")) {
    return <AccessDenied moduleTitle="Tickets" />;
  }
  if (!canReadTicketAdmin(user.role)) {
    return <AccessDenied moduleTitle="KB categories" />;
  }

  const { edit, delete: deleteId, blocked } = await searchParams;
  const [categories, articles] = await Promise.all([
    listKbCategories(true),
    listKbArticles({ includeInternal: true, includeInactive: true }),
  ]);
  const canEdit = canConfigureTickets(user.role);
  const editing = edit ? categories.find((category) => category.id === edit) : undefined;

  const counts = new Map<string, { total: number; public: number }>();
  for (const article of articles) {
    const entry = counts.get(article.categoryId) ?? { total: 0, public: 0 };
    entry.total += 1;
    if (article.visibility === "public") entry.public += 1;
    counts.set(article.categoryId, entry);
  }

  const blockedCategory = blocked ? categories.find((category) => category.id === blocked) : undefined;
  const blockedCount = blockedCategory ? (counts.get(blockedCategory.id)?.total ?? 0) : 0;

  return (
    <div className="space-y-5">
      <PageHeader title="KB categories">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
          <TicketAdminTabs active="kb-categories" />
          <p className="text-[12px] text-muted">
            {categories.length} {categories.length === 1 ? "category" : "categories"} · {articles.length}{" "}
            {articles.length === 1 ? "article" : "articles"} across them ·{" "}
            <Link href="/modules/kb" className="text-navy underline-offset-2 hover:underline">
              open the knowledge base
            </Link>
          </p>
        </div>
      </PageHeader>

      {canEdit ? (
        <KbCategoryForm
          key={editing?.id ?? "new"}
          action={saveKbCategoryAction}
          category={editing}
        />
      ) : (
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          Your role can read the categories but not change them.
        </p>
      )}

      {blockedCategory && (
        <p
          role="alert"
          className="border border-[#eccfcd] bg-danger-soft px-4 py-2.5 text-[12.5px] text-danger"
        >
          &quot;{blockedCategory.name}&quot; still holds {blockedCount}{" "}
          {blockedCount === 1 ? "article" : "articles"}. Move them to another category first, or
          deactivate the category instead.
        </p>
      )}

      <ul className="divide-y divide-line border-y border-line bg-surface">
        {categories.map((category) => {
          const entry = counts.get(category.id) ?? { total: 0, public: 0 };
          const confirming = deleteId === category.id;
          return (
            <li
              key={category.id}
              className={
                editing?.id === category.id
                  ? "border-l-2 border-navy px-4 py-3 sm:px-5"
                  : "px-4 py-3 sm:px-5"
              }
            >
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
                  <Link
                    href={`/modules/tickets/masters/kb-categories?edit=${category.id}`}
                    className="text-[11.5px] text-body underline-offset-2 hover:text-navy hover:underline"
                  >
                    Edit
                  </Link>
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
                  {confirming ? (
                    <form action={kbCategoryRowAction} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={category.id} />
                      <input type="hidden" name="value" value="delete" />
                      <span className="text-[11.5px] text-danger">Delete this category?</span>
                      <button
                        type="submit"
                        className="text-[11.5px] font-medium text-danger underline-offset-2 hover:underline"
                      >
                        Yes, delete
                      </button>
                      <Link
                        href="/modules/tickets/masters/kb-categories"
                        className="text-[11.5px] text-muted hover:text-navy"
                      >
                        Cancel
                      </Link>
                    </form>
                  ) : (
                    <Link
                      href={`/modules/tickets/masters/kb-categories?delete=${category.id}`}
                      className="text-[11.5px] text-muted underline-offset-2 hover:text-danger hover:underline"
                    >
                      Delete
                    </Link>
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
