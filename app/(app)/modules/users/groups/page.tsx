import type { Metadata } from "next";
import { AccessDenied } from "@/components/modules/access-denied";
import { UserGroupsView } from "@/components/modules/user-groups-view";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { getModule } from "@/lib/modules";
import { listDirectory, listGroups } from "@/lib/users/repository";

const MODULE = getModule("users");

export const metadata: Metadata = { title: "Manage Groups" };

export default async function UserGroupsPage() {
  const user = await requireUser();

  if (!canAccessModule(user.role, "users")) {
    return <AccessDenied moduleTitle={MODULE?.title ?? "Users & Groups"} />;
  }

  const [groups, directory] = await Promise.all([listGroups(), listDirectory()]);

  return (
    <UserGroupsView
      groups={groups.groups}
      error={groups.error}
      people={directory.users.map((person) => ({ id: person.id, name: person.name }))}
      canManage={user.role === "super_admin"}
    />
  );
}
