import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { RoleMetaForm } from "@/components/modules/role-meta-form";
import { UsersTabs } from "@/components/modules/users-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { canAccessModule } from "@/lib/access";
import { canEditRoles, canReadRoles } from "@/lib/roles/access";
import { requireUser } from "@/lib/auth";
import { createRoleAction } from "../actions";

export const metadata: Metadata = { title: "New role" };

/**
 * A role begins as a name and nothing else.
 *
 * Two steps rather than one long form: save the name, land on the grid, then
 * decide what it may actually reach. Nobody gets a role that grants access by
 * accident, because the default answer on every row is Not allowed.
 */
export default async function NewRolePage() {
  const user = await requireUser();
  if (!canReadRoles(user.role)) {
    return <AccessDenied moduleTitle="Users & Groups" />;
  }

  if (!canEditRoles(user.role)) {
    return (
      <div className="space-y-4">
        <PageHeader title="New role">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-4">
            <UsersTabs
              active="roles"
              canViewDirectory={canAccessModule(user.role, "users")}
            />
          </div>
        </PageHeader>
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          Granting access is limited to administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="New role">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-4">
          <UsersTabs
            active="roles"
            canViewDirectory={canAccessModule(user.role, "users")}
          />
          <Link
            href="/modules/users/roles"
            className="inline-flex items-center gap-1 text-[11.5px] text-muted transition-colors hover:text-navy"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden />
            All roles
          </Link>
        </div>
      </PageHeader>

      <RoleMetaForm mode="create" action={createRoleAction} />
    </div>
  );
}
