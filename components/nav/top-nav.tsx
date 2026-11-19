"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Check,
  ChevronDown,
  LogOut,
  Menu,
  Search,
  Settings as SettingsIcon,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ModuleGlyph } from "@/components/module-glyph";
import { Wordmark } from "@/components/brand";
import { logoutAction } from "@/lib/auth/actions";

export type NavModule = {
  id: string;
  title: string;
  href: string;
  summary: string;
  icon: string;
};

export type NavGroup = {
  id: string;
  label: string;
  modules: NavModule[];
};

export type NavUser = {
  name: string;
  email: string;
  title: string;
  roleLabel: string;
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function TopNav({
  groups,
  user,
  approvals,
}: {
  groups: NavGroup[];
  user: NavUser;
  approvals: { id: string; title: string }[];
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const shellRef = useRef<HTMLDivElement>(null);

  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);

  const activeGroup = groups.find((group) =>
    group.modules.some((module) => pathname.startsWith(module.href)),
  );

  const closeAll = useCallback(() => {
    setOpenGroup(null);
    setUserOpen(false);
    setBellOpen(false);
  }, []);

  useEffect(() => {
    closeAll();
    setMobileOpen(false);
    setSearchOpen(false);
  }, [pathname, closeAll]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!shellRef.current?.contains(event.target as Node)) closeAll();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeAll();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeAll]);

  return (
    <div ref={shellRef} className="sticky top-0 z-50">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:gap-8 lg:px-8">
          {/* Brand */}
          <Link href="/modules" className="flex shrink-0 items-center gap-3">
            <Wordmark height={21} />
            <span className="hidden border-l border-line pl-3 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted xl:inline">
              IT Management
            </span>
          </Link>

          {/* Primary navigation */}
          <nav aria-label="Primary" className="hidden items-center gap-0.5 lg:flex">
            {groups.map((group) => {
              const isActive = activeGroup?.id === group.id;
              const isOpen = openGroup === group.id;
              return (
                <div key={group.id} className="relative">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-haspopup="true"
                    onClick={() => {
                      setOpenGroup(isOpen ? null : group.id);
                      setUserOpen(false);
                      setBellOpen(false);
                    }}
                    className={clsx(
                      "relative flex items-center gap-1 rounded px-2.5 py-2 text-[13px] transition-colors",
                      isActive || isOpen
                        ? "font-medium text-navy"
                        : "text-body hover:text-navy",
                    )}
                  >
                    {group.label}
                    <ChevronDown
                      className={clsx(
                        "h-3.5 w-3.5 text-muted transition-transform duration-150",
                        isOpen && "rotate-180",
                      )}
                      aria-hidden
                    />
                    {isActive && (
                      <span className="absolute inset-x-2.5 -bottom-[13px] h-[2px] bg-gold" />
                    )}
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                        className="fixed inset-x-0 top-16 z-40 border-b border-line bg-surface shadow-[0_16px_32px_-28px_rgba(23,44,82,0.55)]"
                      >
                        <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[200px_1fr] lg:px-8">
                          <div className="border-line lg:border-r lg:pr-8">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gold">
                              {group.label}
                            </p>
                            <p className="mt-1 text-[12px] text-muted">
                              {group.modules.length}{" "}
                              {group.modules.length === 1 ? "page" : "pages"}
                            </p>
                          </div>

                          <ul className="grid grid-cols-1 gap-x-10 gap-y-1 sm:grid-cols-2">
                            {group.modules.map((module) => {
                              const current = pathname.startsWith(module.href);
                              return (
                                <li key={module.id}>
                                  <Link
                                    href={module.href}
                                    className={clsx(
                                      "group flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors",
                                      current ? "bg-[#f7f4ec]" : "hover:bg-[#f5f7fb]",
                                    )}
                                  >
                                    <span
                                      className={clsx(
                                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded border transition-colors",
                                        current
                                          ? "border-gold/50 bg-gold/15 text-navy"
                                          : "border-line bg-[#f7f9fc] text-navy-soft group-hover:border-line-strong",
                                      )}
                                    >
                                      <ModuleGlyph name={module.icon} className="h-4 w-4" />
                                    </span>
                                    <span className="min-w-0">
                                      <span className="flex items-center gap-2">
                                        <span className="text-[13px] font-medium text-navy">
                                          {module.title}
                                        </span>
                                        {current && (
                                          <Check className="h-3 w-3 text-gold" aria-label="Current page" />
                                        )}
                                      </span>
                                      <span className="mt-0.5 block text-[12px] text-muted">
                                        {module.summary}
                                      </span>
                                    </span>
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </nav>

          {/* Utilities */}
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-9 items-center gap-2 rounded-md border border-transparent px-2 text-muted transition hover:border-line hover:bg-[#f5f7fb] hover:text-navy"
              aria-label="Search pages"
            >
              <Search className="h-4 w-4" aria-hidden />
              <span className="hidden text-[12px] xl:inline">Search</span>
              <kbd className="hidden rounded border border-line bg-[#f5f7fb] px-1.5 py-0.5 font-sans text-[10px] text-muted xl:inline">
                ⌘K
              </kbd>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setBellOpen((open) => !open);
                  setUserOpen(false);
                  setOpenGroup(null);
                }}
                aria-expanded={bellOpen}
                aria-label={
                  approvals.length > 0
                    ? `Notifications, ${approvals.length} pending approvals`
                    : "Notifications"
                }
                className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-[#f5f7fb] hover:text-navy"
              >
                <Bell className="h-4 w-4" aria-hidden />
                {approvals.length > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[9px] font-semibold text-navy">
                    {approvals.length}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {bellOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full z-50 mt-2 w-[320px] rounded-md border border-line bg-surface shadow-[0_18px_40px_-24px_rgba(23,44,82,0.45)]"
                  >
                    <div className="border-b border-line px-4 py-3">
                      <p className="text-[12.5px] font-semibold text-navy">Notifications</p>
                    </div>
                    {approvals.length === 0 ? (
                      <p className="px-4 py-6 text-center text-[12.5px] text-muted">
                        You’re all caught up.
                      </p>
                    ) : (
                      <ul className="max-h-[280px] overflow-y-auto py-1">
                        {approvals.map((item) => (
                          <li key={item.id}>
                            <Link
                              href="/modules/approvals"
                              className="block px-4 py-2.5 transition hover:bg-[#f5f7fb]"
                            >
                              <span className="block text-[12.5px] font-medium text-navy">
                                {item.title}
                              </span>
                              <span className="mt-0.5 block text-[11.5px] text-muted">
                                Awaiting a decision
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="border-t border-line px-4 py-2.5">
                      <Link
                        href="/modules/approvals"
                        className="text-[12px] font-medium text-navy hover:underline"
                      >
                        View approvals
                      </Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="mx-1 hidden h-6 w-px bg-line sm:block" />

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setUserOpen((open) => !open);
                  setBellOpen(false);
                  setOpenGroup(null);
                }}
                aria-expanded={userOpen}
                aria-haspopup="true"
                className="flex h-9 items-center gap-2 rounded-md pl-1 pr-2 transition hover:bg-[#f5f7fb]"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white">
                  {initials(user.name)}
                </span>
                <span className="hidden text-left leading-tight md:block">
                  <span className="block max-w-[140px] truncate text-[12.5px] font-medium text-navy">
                    {user.name}
                  </span>
                  <span className="block max-w-[140px] truncate text-[10.5px] text-muted">
                    {user.roleLabel}
                  </span>
                </span>
                <ChevronDown className="hidden h-3.5 w-3.5 text-muted md:block" aria-hidden />
              </button>

              <AnimatePresence>
                {userOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full z-50 mt-2 w-[248px] rounded-md border border-line bg-surface shadow-[0_18px_40px_-24px_rgba(23,44,82,0.45)]"
                  >
                    <div className="border-b border-line px-4 py-3">
                      <p className="text-[13px] font-medium text-navy">{user.name}</p>
                      <p className="mt-0.5 truncate text-[11.5px] text-muted">{user.email}</p>
                    </div>
                    <div className="py-1">
                      <Link
                        href="/modules/settings"
                        className="flex items-center gap-2.5 px-4 py-2 text-[12.5px] text-body transition hover:bg-[#f5f7fb] hover:text-navy"
                      >
                        <UserRound className="h-3.5 w-3.5" aria-hidden />
                        Profile
                      </Link>
                      <Link
                        href="/modules/settings"
                        className="flex items-center gap-2.5 px-4 py-2 text-[12.5px] text-body transition hover:bg-[#f5f7fb] hover:text-navy"
                      >
                        <SettingsIcon className="h-3.5 w-3.5" aria-hidden />
                        Settings
                      </Link>
                    </div>
                    <form action={logoutAction} className="border-t border-line py-1">
                      <button
                        type="submit"
                        className="flex w-full items-center gap-2.5 px-4 py-2 text-[12.5px] text-body transition hover:bg-danger-soft hover:text-danger"
                      >
                        <LogOut className="h-3.5 w-3.5" aria-hidden />
                        Sign out
                      </button>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              className="ml-0.5 flex h-9 w-9 items-center justify-center rounded-md text-navy transition hover:bg-[#f5f7fb] lg:hidden"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile navigation */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.nav
            aria-label="Mobile navigation"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden border-b border-line bg-surface lg:hidden"
          >
            <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-4 sm:px-6">
              {groups.map((group) => (
                <div key={group.id}>
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-gold">
                    {group.label}
                  </p>
                  <ul className="mt-1.5 space-y-0.5">
                    {group.modules.map((module) => {
                      const current = pathname.startsWith(module.href);
                      return (
                        <li key={module.id}>
                          <Link
                            href={module.href}
                            className={clsx(
                              "flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px]",
                              current
                                ? "bg-[#f7f4ec] font-medium text-navy"
                                : "text-body hover:bg-[#f5f7fb]",
                            )}
                          >
                            <ModuleGlyph name={module.icon} className="h-4 w-4 text-navy-soft" />
                            {module.title}
                            {current && <Check className="ml-auto h-3.5 w-3.5 text-gold" />}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              <div className="flex items-center justify-between border-t border-line pt-3">
                <div>
                  <p className="text-[12.5px] font-medium text-navy">{user.name}</p>
                  <p className="text-[11px] text-muted">{user.roleLabel}</p>
                </div>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] text-body transition hover:bg-danger-soft hover:text-danger"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden />
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      <CommandPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        groups={groups}
        onNavigate={(href) => {
          setSearchOpen(false);
          router.push(href);
        }}
      />
    </div>
  );
}

function CommandPalette({
  open,
  onClose,
  groups,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  groups: NavGroup[];
  onNavigate: (href: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const all = [
      {
        id: "all-modules",
        title: "All modules",
        href: "/modules",
        summary: "Every workspace on one grid",
        icon: "LayoutDashboard",
        groupLabel: "Workspace",
      },
      ...groups.flatMap((group) =>
        group.modules.map((module) => ({ ...module, groupLabel: group.label })),
      ),
    ];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (module) =>
        module.title.toLowerCase().includes(q) ||
        module.summary.toLowerCase().includes(q) ||
        module.groupLabel.toLowerCase().includes(q),
    );
  }, [groups, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      window.setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 pt-[12vh]">
      <div
        className="fixed inset-0 bg-[#0f2142]/35 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="relative w-full max-w-[560px] overflow-hidden rounded-lg border border-line bg-surface shadow-[0_24px_60px_-24px_rgba(23,44,82,0.4)]"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="h-4 w-4 text-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor((c) => Math.min(results.length - 1, c + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              } else if (event.key === "Enter" && results[cursor]) {
                event.preventDefault();
                onNavigate(results[cursor].href);
              }
            }}
            placeholder="Search pages"
            aria-label="Search pages"
            className="h-12 flex-1 bg-transparent text-[13.5px] text-navy outline-none placeholder:text-[#9aa5b8]"
          />
          <kbd className="rounded border border-line bg-[#f5f7fb] px-1.5 py-0.5 text-[10px] text-muted">
            ESC
          </kbd>
        </div>

        <ul className="max-h-[340px] overflow-y-auto py-1.5">
          {results.length === 0 && (
            <li className="px-4 py-6 text-center text-[12.5px] text-muted">
              No pages match “{query}”.
            </li>
          )}
          {results.map((module, index) => (
            <li key={module.id}>
              <button
                type="button"
                onMouseEnter={() => setCursor(index)}
                onClick={() => onNavigate(module.href)}
                className={clsx(
                  "flex w-full items-center gap-3 px-4 py-2.5 text-left transition",
                  index === cursor ? "bg-[#f7f4ec]" : "hover:bg-[#f5f7fb]",
                )}
              >
                <ModuleGlyph name={module.icon} className="h-4 w-4 text-navy-soft" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-navy">{module.title}</span>
                  <span className="block truncate text-[11.5px] text-muted">{module.summary}</span>
                </span>
                <span className="text-[10.5px] uppercase tracking-wide text-muted">
                  {module.groupLabel}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
