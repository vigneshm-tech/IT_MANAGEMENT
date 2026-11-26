import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, Lock, Trash2 } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { RoleMetaForm } from "@/components/modules/role-meta-form";
import { RolePermissionsGrid } from "@/components/modules/role-permissions-grid";
import { UsersTabs } from "@/components/modules/users-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { canAccessModule } from "@/lib/access";
import { canEditRoles, canReadRoles } from "@/lib/roles/access";
import { requireUser } from "@/lib/auth";
import { buildGridGroups } from "@/lib/roles/grid";
import { findRoleDefinition } from "@/lib/roles/registry";
import { deleteRoleAction, saveRoleLevelsAction, saveRoleMetaAction } from "../actions";

export const metadata: Metadata = { title: "Role permissions" };

export default async function RoleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; saved?: string; error?: string }>;
}) {
  const user = await requireUser();
  if (!canReadRoles(user.role)) {
    return <AccessDenied moduleTitle="Users & Groups" />;
  }

  const [{ id }, flags] = await Promise.all([params, searchParams]);
  const role = findRoleDefinition(id);
  if (!role) notFound();

  const isAdmin = canEditRoles(user.role);
  const groups = buildGridGroups(role);

  return (
    <div className="space-y-4">
      <PageHeader title={role.label}>
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

      {flags.created && (
        <p className="flex items-center gap-2 border border-[#cfe3d2] bg-success-soft px-4 py-2.5 text-[12.5px] text-success">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          Role created. Choose the modules this role needs.
        </p>
      )}
      {flags.saved && (
        <p className="flex items-center gap-2 border border-[#cfe3d2] bg-success-soft px-4 py-2.5 text-[12.5px] text-success">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          Saved.
        </p>
      )}
      {flags.error && (
        <p className="flex items-center gap-2 border border-[#f0d5d5] bg-danger-soft px-4 py-2.5 text-[12.5px] text-danger">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden />
          {flags.error}
        </p>
      )}

      {isAdmin && !role.builtin ? (
        <RoleMetaForm
          mode="edit"
          action={saveRoleMetaAction}
          role={{
            id: role.id,
            label: role.label,
            group: role.group,
            level: role.level,
          }}
        />
      ) : (
        <div className="border border-line bg-surface px-4 py-3 sm:px-5">
          <p className="text-[11.5px] text-muted">
            Key <code className="font-mono">{role.id}</code>
            {role.builtin ? " · built-in role" : ""} · {role.level}
            {role.unrestrictedTaskCreation ? " · creates tasks any hour" : ""}
          </p>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold text-navy">Module access</h2>
        {isAdmin ? (
          <RolePermissionsGrid roleId={role.id} groups={groups} action={saveRoleLevelsAction} />
        ) : (
          <RolePermissionsGrid
            roleId={role.id}
            groups={groups}
            action={saveRoleLevelsAction}
            readOnly
          />
        )}
      </section>

      {isAdmin && !role.builtin && (
        <section className="space-y-2">
          <h2 className="text-[13px] font-semibold text-navy">Delete this role</h2>
          <div className="flex flex-wrap items-center justify-between gap-3 border border-[#f0d5d5] bg-danger-soft px-4 py-3">
            <p className="max-w-xl text-[12px] leading-relaxed text-danger">
              {role.members > 0 ? (
                <>
                  {role.members} {role.members === 1 ? "account holds" : "accounts hold"} this role.
                  Move them to another role first — deleting it would leave them with nothing.
                </>
              ) : (
                <>
                  Nobody holds this role — deleting it removes only the definition.
                </>
              )}
            </p>
            <form action={deleteRoleAction}>
              <input type="hidden" name="id" value={role.id} />
              <button
                type="submit"
                disabled={role.members > 0}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#eccfcd] bg-surface px-3 text-[12px] font-medium text-danger transition-colors hover:bg-[#fbeceb] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {role.members > 0 ? (
                  <Lock className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                )}
                Delete role
              </button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
