import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { RoleMetaForm } from "@/components/modules/role-meta-form";
import { SettingsTabs } from "@/components/modules/settings-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { can, canAccessModule } from "@/lib/access";
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
  if (!canAccessModule(user.role, "settings")) {
    return <AccessDenied moduleTitle="Settings" />;
  }

  if (!can(user.role, "settings", "admin")) {
    return (
      <div className="space-y-4">
        <PageHeader title="New role">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-4">
            <SettingsTabs active="roles" />
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
          <SettingsTabs active="roles" />
          <Link
            href="/modules/settings/roles"
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
