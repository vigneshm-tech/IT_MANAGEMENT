import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { ModulesGrid, type ModuleCard } from "@/components/modules/modules-grid";
import { requireUser } from "@/lib/auth";
import { visibleModules } from "@/lib/access";
import { ROLE_BY_ID } from "@/lib/roles";

export const metadata: Metadata = { title: "Modules" };

export default async function ModulesPage() {
  const user = await requireUser();
  const role = ROLE_BY_ID[user.role];

  const modules: ModuleCard[] = visibleModules(user.role).map((module) => ({
    id: module.id,
    title: module.title,
    href: module.href,
    summary: module.summary,
    icon: module.icon,
    navGroup: module.navGroup,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modules"
        meta={
          <span className="text-[12.5px] text-muted">
            {modules.length} available to {role.label}
          </span>
        }
        description="Every workspace your role can open, in one place."
      />
      <ModulesGrid modules={modules} />
    </div>
  );
}
