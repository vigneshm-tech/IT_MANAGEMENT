"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  LayoutGrid,
  Lock,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { TornadoMark, Wordmark } from "@/components/brand";
import { ModuleGlyph } from "@/components/module-glyph";
import { RoleBadge } from "@/components/role-badge";
import { WorkspaceClock } from "@/components/app/workspace-clock";
import { logoutAction } from "@/lib/auth/actions";
import type { RoleId } from "@/lib/roles";
import type { TaskWindow } from "@/lib/task-window";

export type NavModule = {
  id: string;
  title: string;
  href: string;
  icon: string;
  accent: string;
  tagline: string;
};

export type ShellUser = {
  name: string;
  email: string;
  title: string;
  role: RoleId;
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function WorkspaceShell({
  user,
  visible,
  locked,
  taskWindow,
  children,
}: {
  user: ShellUser;
  visible: NavModule[];
  locked: NavModule[];
  taskWindow: TaskWindow;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const active = visible.find((m) => pathname?.startsWith(m.href));
  const lockedActive = locked.find((m) => pathname?.startsWith(m.href));

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pb-5 pt-6">
        <Link href="/modules/dashboard" aria-label="TaskTornado home">
          <Wordmark compact />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-lg p-1.5 text-muted transition hover:bg-surface-3 hover:text-ink lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-5">
        <div className="rounded-xl border border-line bg-surface-2/50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Signed in as
            </span>
            <span className="flex h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand to-accent text-[11px] font-semibold text-white">
              {initials(user.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium text-ink">{user.name}</p>
              <p className="truncate text-[10.5px] text-muted">{user.title}</p>
            </div>
          </div>
        </div>
      </div>

      <nav className="mt-6 flex-1 overflow-y-auto px-3" aria-label="Modules">
        <div className="flex items-center justify-between px-2 pb-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Modules
          </span>
          <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] text-muted">
            {visible.length}
          </span>
        </div>
        <ul className="space-y-1">
          {visible.map((module) => {
            const isActive = pathname?.startsWith(module.href);
            return (
              <li key={module.id}>
                <Link
                  href={module.href}
                  aria-current={isActive ? "page" : undefined}
                  className={clsx(
                    "group relative flex items-center gap-3 rounded-xl px-2.5 py-2 text-[12.5px] transition",
                    isActive
                      ? "bg-brand/14 text-white"
                      : "text-muted hover:bg-surface-2/80 hover:text-ink",
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-soft"
                    />
                  )}
                  <span
                    className={clsx(
                      "flex h-7 w-7 items-center justify-center rounded-lg border transition",
                      isActive
                        ? "border-white/10 bg-white/5 text-white"
                        : "border-line/70 bg-surface-2/50 text-muted group-hover:text-ink",
                    )}
                    style={isActive ? { color: module.accent } : undefined}
                  >
                    <ModuleGlyph name={module.icon} className="h-3.5 w-3.5" />
                  </span>
                  <span className="truncate">{module.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {locked.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-1.5 px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              <Lock className="h-3 w-3" aria-hidden />
              Restricted
              <span className="ml-auto rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] normal-case tracking-normal">
                {locked.length}
              </span>
            </div>
            <ul className="space-y-1">
              {locked.map((module) => (
                <li
                  key={module.id}
                  className="flex cursor-not-allowed items-center gap-3 rounded-xl px-2.5 py-2 text-[12.5px] text-muted/50"
                  title={`${module.title} is not available for your role`}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-line/50 bg-surface-2/30">
                    <ModuleGlyph name={module.icon} className="h-3.5 w-3.5" />
                  </span>
                  <span className="truncate">{module.title}</span>
                  <Lock className="ml-auto h-3 w-3" aria-hidden />
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      <div className="border-t border-line/70 p-3">
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-[12.5px] text-muted transition hover:bg-danger/10 hover:text-danger"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-line/70 bg-surface-2/50">
              <LogOut className="h-3.5 w-3.5" aria-hidden />
            </span>
            Sign out
          </button>
        </form>
        <p className="px-2.5 pt-2 text-[10px] text-muted/60">TaskTornado v0.1</p>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-line/70 bg-surface/60 backdrop-blur-xl lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-line bg-surface lg:hidden"
            >
              {sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-20 border-b border-line/70 bg-base/70 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-line bg-surface/70 p-2 text-muted transition hover:text-ink lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="flex min-w-0 items-center gap-2.5">
              <span className="hidden h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface-2/60 sm:flex lg:hidden">
                <TornadoMark className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-muted">
                  <LayoutGrid className="h-3 w-3" aria-hidden />
                  Workspace
                </p>
                <h1 className="truncate text-[14.5px] font-semibold text-ink">
                  {active?.title ?? lockedActive?.title ?? "TaskTornado"}
                </h1>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2.5">
              <RoleBadge role={user.role} size="sm" className="hidden sm:inline-flex" />
              <WorkspaceClock initial={taskWindow} />
              <span className="hidden h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand to-accent text-[11px] font-semibold text-white sm:flex">
                {initials(user.name)}
              </span>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>

        <footer className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-8 pt-2 text-[11px] text-muted/70 sm:px-6 lg:px-8">
          <span>TaskTornado</span>
          <span className="h-1 w-1 rounded-full bg-line" aria-hidden />
          <span>Role-based workspace</span>
          <span className="h-1 w-1 rounded-full bg-line" aria-hidden />
          <span>{user.email}</span>
          <Link href="/modules/settings" className="ml-auto inline-flex items-center gap-1 hover:text-ink">
            Settings
            <ChevronLeft className="h-3 w-3 rotate-180" aria-hidden />
          </Link>
        </footer>
      </div>
    </div>
  );
}
