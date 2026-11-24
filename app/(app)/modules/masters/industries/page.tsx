import type { Metadata } from "next";
import { Factory } from "lucide-react";
import { MasterRegister } from "@/components/modules/master-register";
import { AccessDenied } from "@/components/modules/access-denied";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listIndustries } from "@/lib/records/repository";
import {
  addIndustryAction,
  industryRowAction,
} from "@/app/(app)/modules/masters/industries/actions";

export const metadata: Metadata = { title: "Industries" };

export default async function IndustriesPage({
  searchParams,
}: {
  searchParams: Promise<{ delete?: string; updated?: string; deleted?: string }>;
}) {
  const user = await requireUser();

  if (!canAccessModule(user.role, "masters")) {
    return <AccessDenied moduleTitle="Masters" />;
  }

  const { delete: deleteId, updated, deleted } = await searchParams;
  const items = await listIndustries();

  const updatedItem = updated ? items.find((item) => item.id === updated) : undefined;
  const notice = updatedItem
    ? { tone: "success" as const, text: `"${updatedItem.name}" was updated.` }
    : deleted
      ? { tone: "muted" as const, text: "Industry deleted." }
      : undefined;

  return (
    <MasterRegister
      title="Industries"
      items={items}
      canEdit={can(user.role, "masters", "edit")}
      deleteId={deleteId}
      notice={notice}
      addAction={addIndustryAction}
      rowAction={industryRowAction}
      basePath="/modules/masters/industries"
      deleteQuestion={'Delete "{name}"?'}
      deleteExplanation={
        "Clients already using it keep their text. This cannot be undone."
      }
      addLabel="Add industry"
      nameLabel="Industry name"
      namePlaceholder="e.g. Pharmaceuticals"
      addFootnote="Deactivate rather than delete if clients already use it."
      emptyIcon={<Factory className="h-4 w-4" aria-hidden />}
      emptyTitle="No industries yet"
      emptyDescription="Industries appear in the client form."
      tableId="industries"
      exportName="tasktornado-industries"
      searchPlaceholder="Search industries"
    />
  );
}
