import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { MasterRegister } from "@/components/modules/master-register";
import { AccessDenied } from "@/components/modules/access-denied";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listApprovals, listRequestTypes } from "@/lib/records/repository";
import {
  addRequestTypeAction,
  requestTypeRowAction,
} from "@/app/(app)/modules/masters/request-types/actions";

export const metadata: Metadata = { title: "Request types" };

export default async function RequestTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ delete?: string; updated?: string; deleted?: string }>;
}) {
  const user = await requireUser();

  if (!canAccessModule(user.role, "masters")) {
    return <AccessDenied moduleTitle="Masters" />;
  }

  const { delete: deleteId, updated, deleted } = await searchParams;
  const [items, approvals] = await Promise.all([listRequestTypes(), listApprovals()]);

  const active = items.filter((item) => item.status === "active").length;
  const used = approvals.filter((approval) => items.some((type) => type.id === approval.category))
    .length;

  const updatedItem = updated ? items.find((item) => item.id === updated) : undefined;
  const notice = updatedItem
    ? { tone: "success" as const, text: `"${updatedItem.name}" was updated.` }
    : deleted
      ? { tone: "muted" as const, text: "Request type deleted." }
      : undefined;

  return (
    <MasterRegister
      title="Request types"
      description={
        <>
          {active} active {active === 1 ? "type" : "types"} of {items.length}. The approval form offers
          this register for its Request type list, and {used} {used === 1 ? "approval" : "approvals"}{" "}
          already carry one of these. Renaming a type relabels the approvals filed under it without
          touching them; deactivate one to retire it without losing its history.
        </>
      }
      items={items}
      canEdit={can(user.role, "masters", "edit")}
      deleteId={deleteId}
      notice={notice}
      addAction={addRequestTypeAction}
      rowAction={requestTypeRowAction}
      basePath="/modules/masters/request-types"
      deleteQuestion={'Delete "{name}"?'}
      deleteExplanation={
        "Existing approvals keep this name. This cannot be undone."
      }
      addLabel="Add request type"
      nameLabel="Request type"
      namePlaceholder="e.g. Vendor onboarding"
      addFootnote="Only active types can be chosen. Deactivate rather than delete if approvals use it."
      emptyIcon={<ClipboardList className="h-4 w-4" aria-hidden />}
      emptyTitle="No request types yet"
      emptyDescription="Request types appear in the approval form."
      tableId="request-types"
      exportName="tasktornado-request-types"
      searchPlaceholder="Search request types"
    />
  );
}
