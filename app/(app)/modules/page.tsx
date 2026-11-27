import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { ModulesGrid, type ModuleCard } from "@/components/modules/modules-grid";
import { requireUser } from "@/lib/auth";
import { visibleModules } from "@/lib/access";

export const metadata: Metadata = { title: "Modules" };

export default async function ModulesPage() {
  const user = await requireUser();

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
      />
      <ModulesGrid modules={modules} />
    </div>
  );
}
