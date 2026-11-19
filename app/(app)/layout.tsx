import type { Metadata } from "next";
import Link from "next/link";
import { TopNav, type NavGroup } from "@/components/nav/top-nav";
import { requireUser } from "@/lib/auth";
import { can, visibleModules } from "@/lib/access";
import { NAV_GROUPS } from "@/lib/modules";
import { ROLE_BY_ID } from "@/lib/roles";
import { listApprovals } from "@/lib/records/repository";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const role = ROLE_BY_ID[user.role];
  const allowed = visibleModules(user.role);

  const groups: NavGroup[] = NAV_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    modules: allowed
      .filter((module) => module.navGroup === group.id)
      .map((module) => ({
        id: module.id,
        title: module.title,
        href: module.href,
        summary: module.summary,
        icon: module.icon,
      })),
  })).filter((group) => group.modules.length > 0);

  let approvals: { id: string; title: string }[] = [];
  if (can(user.role, "approvals", "approve")) {
    try {
      approvals = (await listApprovals())
        .filter((approval) => approval.status === "pending")
        .slice(0, 5)
        .map((approval) => ({ id: approval.id, title: approval.title }));
    } catch {
      approvals = [];
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav
        groups={groups}
        user={{
          name: user.name,
          email: user.email,
          title: user.title,
          roleLabel: role.label,
        }}
        approvals={approvals}
      />

      <main className="w-full flex-1 px-4 py-7 sm:px-6 lg:px-8 lg:py-9 xl:px-10">
        {children}
      </main>

      <footer className="border-t border-line">
        <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-4 text-[11.5px] text-muted sm:px-6 lg:px-8 xl:px-10">
          <span className="font-medium text-navy">TaskTornado</span>
          <span className="h-1 w-1 rounded-full bg-line-strong" aria-hidden />
          <span>IT Management</span>
          <span className="h-1 w-1 rounded-full bg-line-strong" aria-hidden />
          <span>{role.label}</span>
          <Link href="/modules/settings" className="ml-auto hover:text-navy">
            Settings
          </Link>
        </div>
      </footer>
    </div>
  );
}
