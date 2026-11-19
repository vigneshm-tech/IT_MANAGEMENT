import type { Metadata } from "next";
import { AmbientBackground } from "@/components/ambient-background";
import {
  WorkspaceShell,
  type NavModule,
} from "@/components/app/workspace-shell";
import { requireUser } from "@/lib/auth";
import { canAccessModule, visibleModules } from "@/lib/access";
import { MODULES } from "@/lib/modules";
import { ROLE_BY_ID } from "@/lib/roles";
import { taskWindowFor } from "@/lib/task-window";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

function toNav(modules: typeof MODULES): NavModule[] {
  return modules.map(({ id, title, href, icon, accent, tagline }) => ({
    id,
    title,
    href,
    icon,
    accent,
    tagline,
  }));
}

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const role = ROLE_BY_ID[user.role];
  const allowed = visibleModules(user.role);
  const locked = MODULES.filter((module) => !canAccessModule(user.role, module.id));

  return (
    <div className="relative min-h-screen">
      <AmbientBackground />
      <div className="relative z-10">
        <WorkspaceShell
          user={{
            name: user.name,
            email: user.email,
            title: user.title || role.label,
            role: user.role,
          }}
          visible={toNav(allowed)}
          locked={toNav(locked)}
          taskWindow={taskWindowFor(user.role)}
        >
          {children}
        </WorkspaceShell>
      </div>
    </div>
  );
}
