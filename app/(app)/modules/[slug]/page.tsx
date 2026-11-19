import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { AccessMatrix } from "@/components/modules/access-matrix";
import { IntegrationSection } from "@/components/modules/integration-section";
import { ModuleHeader } from "@/components/modules/module-header";
import { ProfileCard } from "@/components/modules/profile-card";
import { RoadmapPanel } from "@/components/modules/roadmap-panel";
import { ServersPanel } from "@/components/modules/servers-panel";
import { TaskBoard, type TaskCardData } from "@/components/modules/task-board";
import { TicketsPanel } from "@/components/modules/tickets-panel";
import { can, canAccessModule, visibleModules } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { integrationStatus } from "@/lib/integrations/store";
import { getModule, MODULES } from "@/lib/modules";
import { ROLE_BY_ID, ROLES } from "@/lib/roles";
import { listTasks } from "@/lib/tasks/store";
import { taskWindowFor } from "@/lib/task-window";

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return MODULES.filter((module) => module.id !== "dashboard").map((module) => ({
    slug: module.id,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const module = getModule(slug);
  return { title: module?.title ?? "Module" };
}

function relativeLabel(iso: string, now: Date, timeZone: string): string {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone }).format(
    new Date(iso),
  );
}

function dueLabel(iso: string, now: Date, timeZone: string): string {
  const due = new Date(iso);
  const sameDay =
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(due) ===
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(due);
  if (sameDay) return time;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone }).format(due);
}

export default async function ModulePage({ params }: PageProps) {
  const { slug } = await params;
  const module = getModule(slug);
  if (!module) notFound();

  const user = await requireUser();
  if (!canAccessModule(user.role, module.id)) {
    return <AccessDenied module={module} role={user.role} />;
  }

  const window = taskWindowFor(user.role);
  const now = new Date();
  const redmine = integrationStatus(user.id, "redmine");
  const action1 = integrationStatus(user.id, "action1");

  let status: "live" | "setup" | "planned" = "planned";
  if (module.id === "tasks" || module.id === "settings" || module.id === "dashboard") status = "live";
  if (module.id === "tickets") status = redmine.connected ? "live" : "setup";
  if (module.id === "servers") status = action1.connected ? "live" : "setup";

  let content: React.ReactNode;

  switch (module.id) {
    case "tasks": {
      const tasks: TaskCardData[] = listTasks().map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        assigneeRole: task.assigneeRole,
        createdByName: task.createdBy.name,
        createdByRole: task.createdBy.role,
        createdLabel: relativeLabel(task.createdAt, now, window.timeZone),
        dueLabel: task.dueDate ? dueLabel(task.dueDate, now, window.timeZone) : null,
        overdue: task.dueDate ? new Date(task.dueDate) < now : false,
      }));

      const opensAtLabel = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: window.timeZone,
      }).format(new Date(window.opensAt));

      content = (
        <TaskBoard
          tasks={tasks}
          userRole={user.role}
          userName={user.name}
          canCreate={window.canCreate}
          restricted={window.restricted}
          windowMessage={window.message}
          opensAtLabel={opensAtLabel}
          canEdit={can(user.role, "tasks", "edit")}
        />
      );
      break;
    }

    case "tickets":
      content = <TicketsPanel status={redmine} />;
      break;

    case "servers":
      content = <ServersPanel status={action1} role={user.role} />;
      break;

    case "settings":
      content = (
        <div className="space-y-4">
          <ProfileCard user={user} />
          <IntegrationSection
            redmine={redmine}
            action1={action1}
            canManageAction1={user.role === "it_manager" || user.role === "it_engineer"}
          />
          <AccessMatrix role={user.role} />
          {can(user.role, "settings", "admin") && <RoleDirectory />}
        </div>
      );
      break;

    default:
      content = <RoadmapPanel module={module} />;
  }

  return (
    <div className="space-y-5">
      <ModuleHeader module={module} role={user.role} status={status} />
      {content}
    </div>
  );
}

function RoleDirectory() {
  return (
    <section className="rounded-2xl border border-line/70 bg-surface/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Users className="h-4 w-4 text-brand-soft" aria-hidden />
            Role directory
          </h2>
          <p className="mt-0.5 text-[12px] text-muted">
            All {ROLES.length} roles configured in the permission registry.
          </p>
        </div>
        <span className="rounded-full border border-line bg-surface-2 px-2 py-1 text-[10px] uppercase tracking-wide text-muted">
          Admin view
        </span>
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {ROLES.map((role) => (
          <li
            key={role.id}
            className="flex items-center justify-between gap-2 rounded-xl border border-line/60 bg-surface-2/40 px-3 py-2.5"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: role.accent }}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-medium text-ink">{role.label}</span>
                <span className="block truncate text-[10.5px] capitalize text-muted">
                  {role.level}
                </span>
              </span>
            </span>
            <span className="shrink-0 rounded-md bg-surface px-1.5 py-0.5 text-[10.5px] text-muted">
              {visibleModules(role.id).length}/{MODULES.length}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-muted/70">
        Role changes are written to <code className="font-mono text-[10.5px]">profiles.role</code> in
        Supabase and audited. {ROLE_BY_ID.it_manager.label}s and Management hold admin rights.
      </p>
    </section>
  );
}
