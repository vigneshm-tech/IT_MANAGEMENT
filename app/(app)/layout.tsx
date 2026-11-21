import type { Metadata } from "next";
import { Heart } from "lucide-react";
import { LaunchIntro } from "@/components/intro/launch-intro";
import { Breadcrumbs } from "@/components/nav/breadcrumbs";
import { TopNav, type NavGroup } from "@/components/nav/top-nav";
import { requireUser } from "@/lib/auth";
import { isIntroPending } from "@/lib/auth/intro";
import { can, visibleModules } from "@/lib/access";
import { NAV_GROUPS } from "@/lib/modules";
import { ROLE_BY_ID } from "@/lib/roles";
import { listPatchInbox, listPendingApprovals } from "@/lib/records/repository";
import { formatPlannedDate } from "@/lib/patching/plan";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const introPending = await isIntroPending();
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

  // The bell is the notification surface: raised requests for the roles that
  // decide them, plus the patch plans this person was named on. A patch
  // approval used to exist only on the Patching Plans screen, so an approver who
  // never opened it was never told.
  const notifications: {
    id: string;
    title: string;
    kind: string;
    href: string;
  }[] = [];

  if (can(user.role, "approvals", "approve")) {
    try {
      for (const approval of await listPendingApprovals()) {
        notifications.push({
          id: approval.id,
          title: approval.title,
          kind: "Request",
          href: "/modules/approvals",
        });
      }
    } catch {
      // A failed read must not take the whole shell down.
    }
  }

  try {
    for (const plan of await listPatchInbox(user.id)) {
      notifications.push({
        id: plan.id,
        title: `${plan.endpointName} · ${formatPlannedDate(plan.plannedDate)}`,
        kind: "Patching",
        href: "/modules/approvals#patching-signoffs",
      });
    }
  } catch {
    // Same here — the badge is a convenience, not a dependency.
  }

  const pendingCount = notifications.length;

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
        notifications={notifications.slice(0, 6)}
        notificationCount={pendingCount}
      />

      <Breadcrumbs />

      <main className="w-full flex-1 px-4 py-7 sm:px-6 lg:px-8 lg:py-9 xl:px-10">
        <LaunchIntro active={introPending}>{children}</LaunchIntro>
      </main>

      <footer className="border-t border-line" data-print="hide">
        <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-4 text-[11.5px] text-muted sm:px-6 lg:px-8 xl:px-10">
          <span className="font-logo text-[12px] leading-none tracking-[0.02em] text-navy">
            TaskTornado
          </span>
          <span className="h-1 w-1 rounded-full bg-line-strong" aria-hidden />
          <span>Developed by Infeara Technologies</span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            Made with
            <Heart className="h-3 w-3 text-gold" aria-hidden />
            <span className="sr-only">love</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
