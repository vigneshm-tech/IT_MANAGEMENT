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

  const active = items.filter((item) => item.status === "active").length;
  const updatedItem = updated ? items.find((item) => item.id === updated) : undefined;
  const notice = updatedItem
    ? { tone: "success" as const, text: `"${updatedItem.name}" was updated.` }
    : deleted
      ? { tone: "muted" as const, text: "The industry was deleted from the register." }
      : undefined;

  return (
    <MasterRegister
      title="Industries"
      description={
        <>
          {active} active {active === 1 ? "industry" : "industries"} of {items.length}. The client
          form offers this register instead of a free-text field, so the same industry is spelled
          the same way on every account. Records that already stored a name keep it.
        </>
      }
      items={items}
      canEdit={can(user.role, "masters", "edit")}
      deleteId={deleteId}
      notice={notice}
      addAction={addIndustryAction}
      rowAction={industryRowAction}
      basePath="/modules/masters/industries"
      deleteQuestion={'Delete "{name}" from the industry register?'}
      deleteExplanation={
        "Clients that already record this industry keep their text — they simply stop matching an option in the form, and the entry cannot be restored afterwards."
      }
      addLabel="Add industry"
      nameLabel="Industry name"
      namePlaceholder="e.g. Pharmaceuticals"
      addFootnote="Deactivate instead if clients already use it and you may want it back."
      emptyIcon={<Factory className="h-4 w-4" aria-hidden />}
      emptyTitle="No industries yet"
      emptyDescription="Add the first industry above — the client form reads this register for its Industry list."
      tableId="industries"
      exportName="tasktornado-industries"
      searchPlaceholder="Search industries"
    />
  );
}
