import type { Metadata } from "next";
import { FormInput } from "lucide-react";
import { MasterRegister } from "@/components/modules/master-register";
import { AccessDenied } from "@/components/modules/access-denied";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { activityModuleLabel } from "@/lib/activity-types";
import { CUSTOM_FIELD_MODULE_OPTIONS } from "@/lib/custom-fields";

const MODULE_LABELS = Object.fromEntries(
  CUSTOM_FIELD_MODULE_OPTIONS.map((option) => [option.value, option.label]),
);
import { listCustomFields } from "@/lib/records/repository";
import {
  addCustomFieldAction,
  customFieldRowAction,
} from "@/app/(app)/modules/masters/custom-fields/actions";

export const metadata: Metadata = { title: "Custom fields" };

export default async function CustomFieldsPage({
  searchParams,
}: {
  searchParams: Promise<{ delete?: string; updated?: string; deleted?: string }>;
}) {
  const user = await requireUser();

  if (!canAccessModule(user.role, "masters")) {
    return <AccessDenied moduleTitle="Masters" />;
  }

  const { delete: deleteId, updated, deleted } = await searchParams;
  const items = await listCustomFields();

  const active = items.filter((item) => item.status === "active").length;
  const modulesUsed = new Set(items.map((item) => item.module)).size;

  const updatedItem = updated ? items.find((item) => item.id === updated) : undefined;
  const notice = updatedItem
    ? { tone: "success" as const, text: `"${updatedItem.name}" was updated.` }
    : deleted
      ? { tone: "muted" as const, text: "The custom field was deleted from the register." }
      : undefined;

  return (
    <MasterRegister
      title="Custom fields"
      description={
        <>
          {active} active {active === 1 ? "field" : "fields"} of {items.length}, spread over{" "}
          {modulesUsed} {modulesUsed === 1 ? "module" : "modules"}. Every field is filed under one
          module when it is created, and the same name may be reused by another module.
        </>
      }
      items={items}
      canEdit={can(user.role, "masters", "edit")}
      deleteId={deleteId}
      notice={notice}
      addAction={addCustomFieldAction}
      rowAction={customFieldRowAction}
      modules={CUSTOM_FIELD_MODULE_OPTIONS}
      defaultModule="clients"
      moduleLabels={MODULE_LABELS}
      basePath="/modules/masters/custom-fields"
      deleteQuestion={'Delete "{name}" from the custom fields register?'}
      deleteExplanation={
        'Filed under {module}. The field appears on that module\u2019s forms. Deleting removes the definition and every answer saved against it, and cannot be undone.'
      }
      addLabel="Add field"
      nameLabel="Field name"
      namePlaceholder="e.g. Contract reference"
      addFootnote="Uniqueness is per module, so Ticket Portal can reuse a field name that Clients already has."
      emptyIcon={<FormInput className="h-4 w-4" aria-hidden />}
      emptyTitle="No custom fields yet"
      emptyDescription="Add the first field above and choose the module it belongs to."
      tableId="custom-fields"
      exportName="tasktornado-custom-fields"
      searchPlaceholder="Search custom fields or modules"
    />
  );
}
