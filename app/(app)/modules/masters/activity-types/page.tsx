import type { Metadata } from "next";
import { AccessDenied } from "@/components/modules/access-denied";
import { ActivityTypesView } from "@/components/modules/activity-types-view";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listActivityTypes } from "@/lib/records/repository";

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

  const updatedType = updated ? items.find((item) => item.id === updated) : undefined;
  const notice = updatedType
    ? { tone: "success" as const, text: `"${updatedType.name}" was updated.` }
    : deleted
      ? { tone: "muted" as const, text: "The activity type was deleted from the register." }
      : undefined;

  return (
    <ActivityTypesView
      items={items}
      canEdit={can(user.role, "masters", "edit")}
      deleteId={deleteId}
      notice={notice}
    />
  );
}
