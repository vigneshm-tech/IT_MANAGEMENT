import type { Metadata } from "next";
import { AccessDenied } from "@/components/modules/access-denied";
import { UsersView } from "@/components/modules/users-view";
import { canAccessModule, canAccessPage } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { getModule } from "@/lib/modules";
import { canManageDirectory } from "@/lib/roles/access";
import { assignableRoleDefinitions } from "@/lib/roles/registry";
import { listDirectory, listGroups } from "@/lib/users/repository";

const MODULE = getModule("users");

export const metadata: Metadata = { title: MODULE?.title ?? "Users & Groups" };

export default async function UsersPage() {
  const user = await requireUser();

  if (!canAccessPage(user.role, "users", "directory")) {
    return <AccessDenied moduleTitle="Manage Users" />;
  }

  if (!canAccessModule(user.role, "users")) {
    return <AccessDenied moduleTitle={MODULE?.title ?? "Users & Groups"} />;
  }

  const [directory, groups] = await Promise.all([listDirectory(), listGroups()]);

  return (
    <UsersView
      users={directory.users}
      groups={groups.groups}
      roles={assignableRoleDefinitions().map((role) => ({ id: role.id, label: role.label }))}
      error={directory.error}
      currentUserId={user.id}
      canManage={canManageDirectory(user.role)}
    />
  );
}
