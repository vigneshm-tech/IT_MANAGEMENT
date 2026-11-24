import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  KeyRound,
  ListChecks,
  Plus,
  Server,
  Ticket,
} from "lucide-react";
import clsx from "clsx";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { can, visibleModules } from "@/lib/access";
import { isOpenStatus } from "@/lib/tasks/options";
import { integrationStatus } from "@/lib/integrations/store";
import { roleOf } from "@/lib/roles";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  daysUntil,
  listApprovals,
  listPatchInbox,
  listRenewals,
} from "@/lib/records/repository";
import { listTasks, type TaskRecord } from "@/lib/tasks/repository";
import { formatDayMonth, formatShortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Overview" };

const DAY = 86400000;

function dayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function buildTrend(tasks: TaskRecord[], days = 14) {
  const buckets = new Map<string, number>();
  const now = new Date();
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(now.getTime() - index * DAY);
    buckets.set(dayKey(date), 0);
  }
  for (const task of tasks) {
    const key = dayKey(new Date(task.createdAt));
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([key, count]) => ({
    key,
    count,
    label: formatShortDate(new Date(`${key}T12:00:00Z`)),
  }));
}

export default async function OverviewPage() {
  const user = await requireUser();
  // One batch: the overview is the landing page, so nothing waits twice.
  const [tasks, approvals, patchInbox, renewals, redmine, action1] = await Promise.all([
    listTasks(),
    listApprovals(),
    listPatchInbox(user.id),
    listRenewals(),
    integrationStatus(user.id, "redmine"),
    integrationStatus(user.id, "action1"),
  ]);
  const now = new Date();

  const openTasks = tasks.filter((task) => isOpenStatus(task.status));
  const inProgress = tasks.filter((task) => task.status === "in_progress");
  const pendingApprovals = approvals.filter((approval) => approval.status === "pending");
  // Patch sign-offs are approvals too, so the overview counts and lists them.
  const awaitingDecision = pendingApprovals.length + patchInbox.length;
  const renewalsDue = renewals.filter(
    (renewal) =>
      renewal.status !== "renewed" &&
      renewal.status !== "expired" &&
      daysUntil(renewal.renewalDate, now) <= 30,
  );
  const overdueTasks = openTasks.filter(
    (task) => task.dueDate && new Date(task.dueDate) < now,
  );

  const trend = buildTrend(tasks);
  const peak = Math.max(1, ...trend.map((point) => point.count));
  const dueSoon = [...renewalsDue].sort(
    (a, b) => daysUntil(a.renewalDate, now) - daysUntil(b.renewalDate, now),
  );

  const attention = [
    ...patchInbox.slice(0, 2).map((plan) => ({
      id: plan.id,
      title: plan.endpointName,
      meta: `Patching sign-off · ${formatDayMonth(`${plan.plannedDate}T12:00:00`, now)}`,
      href: "/modules/approvals#patching-signoffs",
      status: "pending",
    })),
    ...pendingApprovals.slice(0, 2).map((approval) => ({
      id: approval.id,
      title: approval.title,
      meta: `Approval · ${approval.requesterName}`,
      href: "/modules/approvals",
      status: "pending",
    })),
    ...dueSoon.slice(0, 2).map((renewal) => ({
      id: renewal.id,
      title: renewal.item,
      meta: `Renewal · ${formatDayMonth(renewal.renewalDate, now)}`,
      href: "/modules/renewals",
      status: renewal.status,
    })),
    ...overdueTasks.slice(0, 2).map((task) => ({
      id: task.id,
      title: task.title,
      meta: `Task · due ${formatDayMonth(task.dueDate!, now)}`,
      href: "/modules/tasks",
      status: "overdue",
    })),
  ].slice(0, 5);

  const modules = visibleModules(user.role);
  const canApprove = can(user.role, "approvals", "approve");
  const showSetup = !redmine.connected || (!action1.connected && can(user.role, "servers", "view"));

  const metrics = [
    {
      label: "Open tasks",
      value: openTasks.length,
      foot: `${tasks.filter((task) => task.status === "completed").length} completed`,
      icon: ListChecks,
    },
    {
      label: "In progress",
      value: inProgress.length,
      foot: overdueTasks.length > 0 ? `${overdueTasks.length} overdue` : "On schedule",
      icon: CircleDot,
      alert: overdueTasks.length > 0,
    },
    {
      label: "Pending approvals",
      value: awaitingDecision,
      foot:
        patchInbox.length > 0
          ? `${patchInbox.length} patch ${patchInbox.length === 1 ? "sign-off" : "sign-offs"}`
          : canApprove
            ? "Awaiting your decision"
            : "Awaiting leadership",
      icon: BadgeCheck,
    },
    {
      label: "Renewals within 30 days",
      value: renewalsDue.length,
      foot: "Across all owners",
      icon: CalendarClock,
    },
  ];

  return (
    <div className="space-y-9">
      <PageHeader
        title="Overview"
        actions={
          <>
            <Link href="/modules/approvals" className={buttonClass({ variant: "secondary" })}>
              Approvals
            </Link>
            <Link href="/modules/tasks/new" className={buttonClass()}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New task
            </Link>
          </>
        }
      />

      {/* KPI strip */}
      <section aria-label="Key metrics">
        <dl className="grid grid-cols-2 gap-y-6 border-y border-line py-5 lg:grid-cols-4">
          {metrics.map((metric, index) => (
            <div
              key={metric.label}
              className={clsx(
                "px-4 first:pl-0 lg:px-7",
                index > 0 && "border-l border-line",
                index === 2 && "max-lg:border-l-0 max-lg:pl-0",
              )}
            >
              <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                <metric.icon className="h-3.5 w-3.5 text-navy-soft/60" aria-hidden />
                {metric.label}
              </dt>
              <dd className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.02em] text-navy tabular-nums">
                {metric.value}
              </dd>
              <p
                className={clsx(
                  "mt-1.5 text-[11.5px]",
                  metric.alert ? "text-danger" : "text-muted",
                )}
              >
                {metric.foot}
              </p>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
        {/* Chart */}
        <section className="lg:col-span-2" aria-labelledby="activity-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="activity-heading" className="text-[14px] font-semibold text-navy">
                Task volume
              </h2>
              <p className="mt-0.5 text-[12px] text-muted">Tasks created in the last 14 days</p>
            </div>
            <span className="text-[12px] text-muted">
              {trend.reduce((sum, point) => sum + point.count, 0)} total
            </span>
          </div>

          <div className="relative mt-5">
            <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[150px] flex-col justify-between">
              {[0, 1, 2, 3].map((line) => (
                <span key={line} className="block border-t border-dashed border-line" />
              ))}
            </div>
            <div className="relative flex h-[150px] items-end gap-[6px]">
              {trend.map((point) => (
                <div key={point.key} className="group flex h-full flex-1 items-end">
                  <div
                    title={`${point.label}: ${point.count} ${point.count === 1 ? "task" : "tasks"}`}
                    style={{ height: `${Math.max(2, (point.count / peak) * 100)}%` }}
                    className={clsx(
                      "w-full rounded-t-[2px] transition-colors",
                      point.count === 0
                        ? "bg-[#e6ebf3]"
                        : "bg-gold/85 group-hover:bg-navy",
                    )}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between border-t border-line pt-2 text-[10.5px] text-muted">
              <span>{trend[0]?.label}</span>
              <span>{trend[Math.floor(trend.length / 2)]?.label}</span>
              <span>Today</span>
            </div>
          </div>
        </section>

        {/* Attention */}
        <section aria-labelledby="attention-heading">
          <div className="flex items-end justify-between gap-3">
            <h2 id="attention-heading" className="text-[14px] font-semibold text-navy">
              Needs attention
            </h2>
            {attention.length > 0 && (
              <span className="rounded bg-[#eef2f8] px-1.5 py-0.5 text-[10.5px] font-medium text-body">
                {attention.length}
              </span>
            )}
          </div>

          {attention.length === 0 ? (
            <p className="mt-5 flex items-center gap-2 border-t border-line pt-5 text-[12.5px] text-muted">
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
              Nothing needs your attention right now.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line border-t border-line">
              {attention.map((item) => (
                <li key={`${item.href}-${item.id}`}>
                  <Link
                    href={item.href}
                    className="group flex items-start justify-between gap-3 py-3 transition"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-medium text-navy group-hover:text-gold">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] text-muted">{item.meta}</span>
                    </span>
                    <StatusPill status={item.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Recent tasks */}
      <section aria-labelledby="recent-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="recent-heading" className="text-[14px] font-semibold text-navy">
              Recent tasks
            </h2>
            <p className="mt-0.5 text-[12px] text-muted">Latest activity across every team</p>
          </div>
          <Link
            href="/modules/tasks"
            className="text-[12.5px] font-medium text-navy transition hover:text-gold"
          >
            View all
          </Link>
        </div>

        {tasks.length === 0 ? (
          <p className="mt-4 border-t border-line pt-5 text-[12.5px] text-muted">
            No tasks yet.{" "}
            <Link href="/modules/tasks/new" className="font-medium text-navy hover:text-gold">
              Create the first one
            </Link>
            .
          </p>
        ) : (
          <Table className="mt-3 min-w-[640px] border-collapse">
            <TableHeader>
              <TableRow className="border-y border-line hover:bg-transparent">
                <TableHead className="py-2.5 pl-0 pr-4">Task</TableHead>
                <TableHead className="py-2.5 pl-0 pr-4">Team</TableHead>
                <TableHead className="py-2.5 pl-0 pr-4">Due</TableHead>
                <TableHead className="py-2.5 pl-0 text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.slice(0, 6).map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="py-3 pl-0 pr-4">
                    <span className="block text-[12.5px] font-medium text-navy">
                      {task.title}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10.5px] text-muted">
                      {task.id}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 pl-0 pr-4 text-[12px] text-body">
                    {roleOf(task.assigneeRole).label}
                  </TableCell>
                  <TableCell className="py-3 pl-0 pr-4 text-[12px] text-body">
                    {task.dueDate ? formatDayMonth(task.dueDate, now) : "—"}
                  </TableCell>
                  <TableCell className="py-3 pl-0 text-right">
                    <StatusPill status={task.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {/* Workspace setup / integrations */}
      <section aria-labelledby="workspace-heading" className="grid grid-cols-1 gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 id="workspace-heading" className="text-[14px] font-semibold text-navy">
            Workspace
          </h2>
          <p className="mt-0.5 text-[12px] text-muted">
            {modules.length} pages available to your team
          </p>

          <ul className="mt-4 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            {modules
              .filter((module) => module.id !== "dashboard")
              .map((module) => (
                <li key={module.id}>
                  <Link
                    href={module.href}
                    className="group flex items-center justify-between gap-3 border-b border-line py-2.5"
                  >
                    <span className="text-[12.5px] text-body transition group-hover:text-navy">
                      {module.title}
                    </span>
                    <ArrowRight
                      className="h-3.5 w-3.5 text-muted transition group-hover:translate-x-0.5 group-hover:text-gold"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
          </ul>
        </div>

        {showSetup && (
          <div>
            <h2 className="text-[14px] font-semibold text-navy">Connections</h2>
            <p className="mt-0.5 text-[12px] text-muted">Bring your tools into TaskTornado</p>

            <ul className="mt-3 divide-y divide-line border-t border-line">
              {!redmine.connected && (
                <li className="flex items-start gap-3 py-3">
                  <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded bg-[#eef2f8] text-navy-soft">
                    <Ticket className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-medium text-navy">Redmine</p>
                    <p className="mt-0.5 text-[11.5px] text-muted">No API key yet</p>
                  </div>
                  <Link
                    href="/modules/settings/integrations"
                    className="text-[11.5px] font-medium text-navy hover:text-gold"
                  >
                    Connect
                  </Link>
                </li>
              )}
              {!action1.connected && can(user.role, "servers", "view") && (
                <li className="flex items-start gap-3 py-3">
                  <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded bg-[#eef2f8] text-navy-soft">
                    <Server className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-medium text-navy">Action1</p>
                    <p className="mt-0.5 text-[11.5px] text-muted">
                      {user.role === "it_manager" || user.role === "it_engineer"
                        ? "No API key yet"
                        : "Managed by IT"}
                    </p>
                  </div>
                  {(user.role === "it_manager" || user.role === "it_engineer") && (
                    <Link
                      href="/modules/settings/integrations"
                      className="text-[11.5px] font-medium text-navy hover:text-gold"
                    >
                      Configure
                    </Link>
                  )}
                </li>
              )}
            </ul>

            <div className="mt-4 flex items-start gap-2 text-[11.5px] leading-relaxed text-muted">
              <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Keys are stored per user and masked after saving.
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
