import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, Info, Lock, Trash2, Users } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { RoleMetaForm } from "@/components/modules/role-meta-form";
import { RolePermissionsGrid } from "@/components/modules/role-permissions-grid";
import { SettingsTabs } from "@/components/modules/settings-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { buildGridGroups, summariseLevels } from "@/lib/roles/grid";
import { findRoleDefinition } from "@/lib/roles/registry";
import { ROLE_GROUPS } from "@/lib/roles";
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
  if (!canAccessModule(user.role, "settings")) {
    return <AccessDenied moduleTitle="Settings" />;
  }

  const [{ id }, flags] = await Promise.all([params, searchParams]);
  const role = findRoleDefinition(id);
  if (!role) notFound();

  const isAdmin = can(user.role, "settings", "admin");
  const groups = buildGridGroups(role);

  return (
    <div className="space-y-4">
      <PageHeader title={role.label}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-4">
          <SettingsTabs active="roles" />
          <Link
            href="/modules/settings/roles"
            className="inline-flex items-center gap-1 text-[11.5px] text-muted transition-colors hover:text-navy"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden />
            All roles
          </Link>
          <p className="text-[12px] text-muted">
            {ROLE_GROUPS[role.group].label} · {summariseLevels(role.counts)}
            {role.members > 0 && (
              <span className="ml-1 inline-flex items-center gap-1">
                <Users className="h-3 w-3" aria-hidden />
                {role.members} {role.members === 1 ? "account" : "accounts"}
              </span>
            )}
          </p>
        </div>
      </PageHeader>

      {flags.created && (
        <p className="flex items-center gap-2 border border-[#cfe3d2] bg-success-soft px-4 py-2.5 text-[12.5px] text-success">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          Role created. Nothing is allowed yet — tick the modules this role needs.
        </p>
      )}
      {flags.saved && (
        <p className="flex items-center gap-2 border border-[#cfe3d2] bg-success-soft px-4 py-2.5 text-[12.5px] text-success">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          Saved. Everyone holding this role sees the change on their next page.
        </p>
      )}
      {flags.error && (
        <p className="flex items-center gap-2 border border-[#f0d5d5] bg-danger-soft px-4 py-2.5 text-[12.5px] text-danger">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden />
          {flags.error}
        </p>
      )}

      <p className="flex items-start gap-2 border border-line bg-surface px-4 py-2.5 text-[11.5px] leading-relaxed text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-navy" aria-hidden />
        <span>
          {role.builtin
            ? "This is a built-in role. Its name is part of the product, but what it can reach is yours to decide — a module set to Not allowed disappears from this role's navigation and its pages refuse to open."
            : "This role belongs to your workspace. Assign it in Users & Groups and its members see exactly these modules."}{" "}
          {role.id === "super_admin" &&
            "The super admin keeps the user directory whatever is set here."}
        </span>
      </p>

      {isAdmin && !role.builtin ? (
        <RoleMetaForm
          mode="edit"
          action={saveRoleMetaAction}
          role={{
            id: role.id,
            label: role.label,
            description: role.description,
            group: role.group,
            level: role.level,
          }}
        />
      ) : (
        <div className="border border-line bg-surface px-4 py-3 sm:px-5">
          <p className="text-[12.5px] text-body">{role.description || "No description yet."}</p>
          <p className="mt-1 text-[11.5px] text-muted">
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
                  Nobody holds this role, so deleting it removes only the definition. Set its
                  modules to Not allowed instead if you only want to switch it off.
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
