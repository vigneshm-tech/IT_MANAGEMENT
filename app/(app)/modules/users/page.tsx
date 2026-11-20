import type { Metadata } from "next";
import { AccessDenied } from "@/components/modules/access-denied";
import { UsersView } from "@/components/modules/users-view";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { getModule } from "@/lib/modules";
import { listDirectory } from "@/lib/users/repository";

const MODULE = getModule("users");

export const metadata: Metadata = { title: MODULE?.title ?? "Users & Groups" };

export default async function UsersPage() {
  const user = await requireUser();

  if (!canAccessModule(user.role, "users")) {
    return <AccessDenied moduleTitle={MODULE?.title ?? "Users & Groups"} />;
  }

  const directory = await listDirectory();

  return (
    <UsersView
      users={directory.users}
      error={directory.error}
      currentUserId={user.id}
    />
  );
}
