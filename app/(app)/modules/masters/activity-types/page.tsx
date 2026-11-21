import type { Metadata } from "next";
import { Tags } from "lucide-react";
import { MasterRegister } from "@/components/modules/master-register";
import { AccessDenied } from "@/components/modules/access-denied";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import {
  ACTIVITY_MODULE_OPTIONS,
  TASK_ACTIVITY_MODULE,
  activityModuleLabel,
} from "@/lib/activity-types";

const MODULE_LABELS = Object.fromEntries(
  ACTIVITY_MODULE_OPTIONS.map((option) => [option.value, option.label]),
);
import { listActivityTypes } from "@/lib/records/repository";
import {
  activityTypeRowAction,
  addActivityTypeAction,
} from "@/app/(app)/modules/masters/activity-types/actions";

export const metadata: Metadata = { title: "Activity types" };

export default async function ActivityTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ delete?: string; updated?: string; deleted?: string }>;
}) {
  const user = await requireUser();

  if (!canAccessModule(user.role, "masters")) {
    return <AccessDenied moduleTitle="Masters" />;
  }

  const { delete: deleteId, updated, deleted } = await searchParams;
  const items = await listActivityTypes();

  const active = items.filter((item) => item.status === "active").length;
  const taskTypes = items.filter(
    (item) => item.status === "active" && item.module === TASK_ACTIVITY_MODULE,
  ).length;

  const updatedItem = updated ? items.find((item) => item.id === updated) : undefined;
  const notice = updatedItem
    ? { tone: "success" as const, text: `"${updatedItem.name}" was updated.` }
    : deleted
      ? { tone: "muted" as const, text: "The activity type was deleted from the register." }
      : undefined;

  return (
    <MasterRegister
      title="Activity types"
      description={
        <>
          {active} active {active === 1 ? "type" : "types"} of {items.length}. Every type belongs to
          a module; the task form offers the {taskTypes} active {taskTypes === 1 ? "type" : "types"}{" "}
          filed under Task Management. Deactivate a type to retire it without touching the tasks
          that already recorded it.
        </>
      }
      items={items}
      canEdit={can(user.role, "masters", "edit")}
      deleteId={deleteId}
      notice={notice}
      addAction={addActivityTypeAction}
      rowAction={activityTypeRowAction}
      modules={ACTIVITY_MODULE_OPTIONS}
      defaultModule={TASK_ACTIVITY_MODULE}
      moduleLabels={MODULE_LABELS}
      basePath="/modules/masters/activity-types"
      deleteQuestion={'Delete "{name}" from the register?'}
      deleteExplanation={
        'Filed under {module}. Records that already stored this name keep their text — no task, ticket or board entry changes. The type simply stops being offered from now on, and the entry cannot be restored afterwards.'
      }
      addLabel="Add type"
      nameLabel="Activity type name"
      namePlaceholder="e.g. Vulnerability remediation"
      emptyIcon={<Tags className="h-4 w-4" aria-hidden />}
      emptyTitle="No activity types yet"
      emptyDescription="Add the first type above — the task form will only offer types from this register."
      tableId="activity-types"
      exportName="tasktornado-activity-types"
      searchPlaceholder="Search activity types"
    />
  );
}
