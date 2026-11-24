import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ChevronRight, Plus, Users } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { SettingsTabs } from "@/components/modules/settings-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { summariseLevels } from "@/lib/roles/grid";
import { listRoleDefinitions } from "@/lib/roles/registry";
import { ROLE_GROUPS, type RoleGroup } from "@/lib/roles";

export const metadata: Metadata = { title: "Roles & access" };

/** Catalogue order: the teams first, the workspace's own roles last. */
const GROUP_ORDER: RoleGroup[] = [
  "platform",
  "it",
  "l2_support",
  "implementation",
  "development",
  "testing",
  "management",
  "custom",
];

export default async function RolesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const user = await requireUser();
  if (!canAccessModule(user.role, "settings")) {
    return <AccessDenied moduleTitle="Settings" />;
  }

  const isAdmin = can(user.role, "settings", "admin");
  const { deleted } = await searchParams;
  const roles = listRoleDefinitions();

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    label: ROLE_GROUPS[group].label,
    description: ROLE_GROUPS[group].description,
    roles: roles.filter((role) => role.group === group),
  })).filter((entry) => entry.roles.length > 0);

  // Anything whose group fell out of the catalogue still has to be listed.
  const known = new Set(GROUP_ORDER);
  const strays = roles.filter((role) => !known.has(role.group));
  if (strays.length > 0) {
    grouped.push({
      group: "custom",
      label: ROLE_GROUPS.custom.label,
      description: ROLE_GROUPS.custom.description,
      roles: strays,
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Roles & access">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-4">
          <SettingsTabs active="roles" />
          {isAdmin && (
            <Link href="/modules/settings/roles/new" className={buttonClass({ size: "sm" })}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New role
            </Link>
          )}
          <p className="text-[12px] text-muted">
            {roles.length} roles · {roles.filter((role) => !role.hidden).length} assignable
          </p>
        </div>
      </PageHeader>

      {deleted && (
        <p className="flex items-center gap-2 border border-[#cfe3d2] bg-success-soft px-4 py-2.5 text-[12.5px] text-success">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          Role deleted.
        </p>
      )}

      {!isAdmin && (
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          You can read the access matrix but not change it. Granting access is limited to
          administrators.
        </p>
      )}

      <div className="space-y-5">
        {grouped.map((entry) => (
          <section key={entry.group} className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 className="text-[13px] font-semibold text-navy">{entry.label}</h2>
              <p className="text-[11.5px] text-muted">{entry.description}</p>
            </div>

            <ul className="divide-y divide-line border-y border-line bg-surface">
              {entry.roles.map((role) => (
                <li key={role.id}>
                  <Link
                    href={`/modules/settings/roles/${role.id}`}
                    className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#f4f7fc] focus-visible:bg-[#f4f7fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/70 sm:px-5"
                  >
                    <span
                      className="h-8 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: role.accent }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[13px] font-semibold text-navy">{role.label}</span>
                        {role.builtin ? (
                          <span className="rounded-full bg-[#eef2f8] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] text-muted">
                            Built-in
                          </span>
                        ) : (
                          <span className="rounded-full bg-[#eaeef6] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] text-navy">
                            Custom
                          </span>
                        )}
                        {role.hidden && (
                          <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] text-warning">
                            Hidden
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                        {role.description || "No description yet."}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-right text-[11.5px] text-muted md:block">
                      {summariseLevels(role.counts)}
                      {role.members > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 text-body">
                          <Users className="h-3 w-3" aria-hidden />
                          {role.members}
                        </span>
                      )}
                    </span>
                    <ChevronRight
                      aria-hidden
                      className="h-4 w-4 shrink-0 text-[#b9c4d6] transition-colors group-hover:text-navy"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="text-[11.5px] text-muted">
        Assign roles in{" "}
        <Link href="/modules/users" className="text-navy underline underline-offset-2">
          Users &amp; groups
        </Link>
        .
      </p>
    </div>
  );
}
