import type { Metadata } from "next";
import { AccessDenied } from "@/components/modules/access-denied";
import { ActivityTypesView } from "@/components/modules/activity-types-view";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listActivityTypes } from "@/lib/records/repository";

export const metadata: Metadata = { title: "Activity types" };

export default async function ActivityTypesPage() {
  const user = await requireUser();

  if (!canAccessModule(user.role, "masters")) {
    return <AccessDenied moduleTitle="Masters" />;
  }

  return (
    <ActivityTypesView
      items={await listActivityTypes()}
      canEdit={can(user.role, "masters", "edit")}
    />
  );
}
