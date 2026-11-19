import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  KeyRound,
  Layers,
  Lock,
  Radio,
  Server,
  Ticket,
  Users,
} from "lucide-react";
import { ModuleGrid, type GridModule } from "@/components/dashboard/module-grid";
import { RoleBadge } from "@/components/role-badge";
import { requireUser } from "@/lib/auth";
import { accessMap, visibleModules } from "@/lib/access";
import { isDemoMode } from "@/lib/config";
import { MODULES, type Capability } from "@/lib/modules";
import { ROLE_BY_ID, ROLE_GROUPS, ROLES } from "@/lib/roles";
import { taskWindowFor, taskWindowLabel } from "@/lib/task-window";

export const metadata: Metadata = { title: "Dashboard" };

const CAPABILITY_ORDER: Capability[] = ["create", "edit", "approve", "admin"];

function greeting(date: Date, timeZone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(date),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const role = ROLE_BY_ID[user.role];
  const group = ROLE_GROUPS[role.group];
  const window = taskWindowFor(user.role);
  const access = accessMap(user.role);
  const allowed = visibleModules(user.role);
  const now = new Date();

  const gridModules: GridModule[] = MODULES.map((module) => {
    const capabilities = access[module.id];
    const granted = CAPABILITY_ORDER.filter((capability) => capabilities[capability]);
    return {
      id: module.id,
      title: module.title,
      href: module.href,
      tagline: module.tagline,
      description: module.description,
      icon: module.icon,
      accent: module.accent,
      canView: capabilities.view,
      capabilities: granted.length > 0 ? granted : capabilities.view ? ["view"] : [],
    };
  });

  const closedForEngineers = window.restricted && !window.canCreate;
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: window.timeZone,
  }).format(now);

  const stats = [
    {
      label: "Modules available",
      value: `${allowed.length}`,
      suffix: `of ${MODULES.length}`,
      icon: Layers,
      accent: "#7c5cff",
      foot: `${MODULES.length - allowed.length} restricted for your role`,
    },
    {
      label: "Task creation window",
      value: taskWindowLabel(user.role).split(" ")[0],
      suffix: window.restricted ? "IST" : "",
      icon: CalendarClock,
      accent: window.canCreate ? "#34d399" : "#fbbf24",
      foot: window.canCreate ? "Open right now" : "Closed — see window below",
    },
    {
      label: "Your team",
      value: group.label,
      suffix: "",
      icon: Users,
      accent: group.accent,
      foot: role.level === "engineer" ? "Engineer tier" : `${role.level} tier`,
    },
    {
      label: "Identity provider",
      value: isDemoMode ? "Demo" : "Supabase",
      suffix: "",
      icon: KeyRound,
      accent: "#22d3ee",
      foot: `${ROLES.length} roles configured`,
    },
  ];

  return (
    <div className="space-y-7">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-line/80 bg-surface/60 p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-brand/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/70 px-2.5 py-1 text-[10.5px] uppercase tracking-[0.14em] text-muted">
                <CircleDot className="h-3 w-3 text-success" aria-hidden />
                Workspace overview
              </span>
              <span className="text-[11.5px] text-muted">{dateLabel}</span>
            </div>

            <h2 className="mt-3 text-[26px] font-semibold leading-tight tracking-tight text-ink sm:text-[30px]">
              {greeting(now, window.timeZone)},{" "}
              <span className="text-gradient">{user.name.split(" ")[0]}</span>
            </h2>
            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted">
              {role.description}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <RoleBadge role={user.role} />
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]"
                style={{
                  borderColor: `${group.accent}40`,
                  backgroundColor: `${group.accent}12`,
                  color: group.accent,
                }}
              >
                <Users className="h-3 w-3" aria-hidden />
                {group.label}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-2.5 py-1 text-[11px] text-muted">
                <CalendarClock className="h-3 w-3" aria-hidden />
                {taskWindowLabel(user.role)} task window
              </span>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href="/modules/tasks"
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-[#5b8cff] px-3.5 py-2.5 text-[12.5px] font-semibold text-white shadow-[0_14px_30px_-16px_rgba(124,92,255,0.9)] transition hover:brightness-110"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Open task board
              <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link
              href="/modules/tickets"
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5 text-[12.5px] font-medium text-ink transition hover:border-white/20 hover:bg-surface-3"
            >
              <Ticket className="h-4 w-4 text-muted" aria-hidden />
              My tickets
            </Link>
          </div>
        </div>

        {closedForEngineers && (
          <div className="relative mt-5 flex items-start gap-3 rounded-xl border border-warning/25 bg-warning/[0.08] px-4 py-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            <div>
              <p className="text-[12.5px] font-medium text-warning">Engineer task window is closed</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-warning/80">
                New tasks open at{" "}
                {new Intl.DateTimeFormat("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: window.timeZone,
                }).format(new Date(window.opensAt))}{" "}
                IST and run until{" "}
                {new Intl.DateTimeFormat("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: window.timeZone,
                }).format(new Date(window.closesAt))}{" "}
                IST. You can still view and update existing tasks.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Stats */}
      <section aria-label="Workspace snapshot" className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="group relative overflow-hidden rounded-2xl border border-line/70 bg-surface/50 p-4 transition hover:border-white/15 hover:bg-surface-2/60"
          >
            <div className="flex items-start justify-between">
              <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
                {stat.label}
              </span>
              <span
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-line/70 bg-surface-2/70"
                style={{ color: stat.accent }}
              >
                <stat.icon className="h-3.5 w-3.5" aria-hidden />
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline gap-1.5">
              <span className="text-[22px] font-semibold leading-none text-ink">{stat.value}</span>
              {stat.suffix && (
                <span className="text-[11.5px] font-medium text-muted">{stat.suffix}</span>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-muted/80">{stat.foot}</p>
          </div>
        ))}
      </section>

      {/* Modules */}
      <ModuleGrid modules={gridModules} />

      {/* Lower panels */}
      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <div className="rounded-2xl border border-line/70 bg-surface/50 p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
              <Radio className="h-4 w-4 text-brand-soft" aria-hidden />
              Integrations
            </h3>
            <span className="rounded-full border border-line bg-surface-2 px-2 py-1 text-[10px] uppercase tracking-wide text-muted">
              v0.1 setup
            </span>
          </div>
          <p className="mt-1 text-[12px] text-muted">
            Tickets and servers light up once the keys below are saved in Settings.
          </p>

          <ul className="mt-4 space-y-2.5">
            <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line/70 bg-surface-2/40 px-3.5 py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-base/60 text-danger">
                  <Ticket className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-[12.5px] font-medium text-ink">Redmine ticket portal</p>
                  <p className="text-[11px] text-muted">Personal API key, pulled from Settings</p>
                </div>
              </div>
              <Link
                href="/modules/settings"
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand/35 bg-brand/10 px-2.5 py-1.5 text-[11.5px] font-medium text-brand-soft transition hover:bg-brand/20"
              >
                Add API key
                <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line/70 bg-surface-2/40 px-3.5 py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-base/60 text-brand-soft">
                  <Server className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-[12.5px] font-medium text-ink">Action1 servers</p>
                  <p className="text-[11px] text-muted">Configured by IT · visible to IT &amp; leadership</p>
                </div>
              </div>
              <span className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11.5px] text-muted">
                Not configured
              </span>
            </li>
          </ul>
        </div>

        <div className="rounded-2xl border border-line/70 bg-surface/50 p-5">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <Lock className="h-4 w-4 text-warning" aria-hidden />
            Role scope
          </h3>
          <p className="mt-1 text-[12px] text-muted">
            What your role unlocks across the workspace.
          </p>

          <dl className="mt-4 space-y-3 text-[12px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Modules</dt>
              <dd className="font-medium text-ink">
                {allowed.length} available · {MODULES.length - allowed.length} locked
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Task creation</dt>
              <dd className="font-medium text-ink">{taskWindowLabel(user.role)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Approvals</dt>
              <dd className="font-medium text-ink">
                {access.approvals.approve ? "Can approve" : "View only"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Admin settings</dt>
              <dd className="font-medium text-ink">
                {access.settings.admin ? "Full access" : "Personal only"}
              </dd>
            </div>
          </dl>

          {MODULES.length - allowed.length > 0 && (
            <div className="mt-4 rounded-xl border border-line/70 bg-base/40 p-3">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
                Locked for you
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {MODULES.filter((module) => !access[module.id].view).map((module) => (
                  <span
                    key={module.id}
                    className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-muted"
                  >
                    {module.title}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
