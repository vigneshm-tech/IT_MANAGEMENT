"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  ChevronDown,
  LogOut,
  Search,
  Settings as SettingsIcon,
  UserRound,
  Volume2,
  VolumeX,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

/** One row in the bell: a request or a patch sign-off waiting on this person. */
export type NavNotification = {
  id: string;
  title: string;
  /** Short label — "Request" or "Patching". */
  kind: string;
  href: string;
};

export type NavUser = {
  name: string;
  email: string;
  title: string;
  roleLabel: string;
};

/** The chime played when something new lands in the bell. */
const NOTIFICATION_SOUND = "/sounds/notification.wav";
const SOUND_PREFERENCE_KEY = "tt-notification-sound";
const CHIME_VOLUME = 0.7;

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/**
 * Two-zone header: the wordmark sits at the left edge of the page container,
 * the utilities and account menu sit at the right edge. There is no mega-menu —
 * the Modules grid and the ⌘K palette are the navigation.
 */
export function TopNav({
  groups,
  user,
  notifications = [],
  notificationCount = 0,
}: {
  groups: NavGroup[];
  user: NavUser;
  notifications?: NavNotification[];
  /** Everything waiting, including rows beyond the six the menu lists. */
  notificationCount?: number;
}) {
  const router = useRouter();
  const shellRef = useRef<HTMLDivElement>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);

  // Sound on by default; the speaker in the bell menu remembers the choice.
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(true);
  const chimeRef = useRef<HTMLAudioElement | null>(null);
  /** The count the bell last showed — a rise above it is what rings. */
  const seenCount = useRef<number | null>(null);

  /** One shared element, created lazily so nothing loads until it is needed. */
  const getChime = useCallback(() => {
    if (!chimeRef.current) {
      const el = new Audio(NOTIFICATION_SOUND);
      el.preload = "auto";
      chimeRef.current = el;
    }
    return chimeRef.current;
  }, []);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(SOUND_PREFERENCE_KEY) === "off") {
        setSoundOn(false);
        soundOnRef.current = false;
      }
    } catch {
      // Storage blocked (private mode): the choice just does not persist.
    }
  }, []);

  /**
   * Browsers block audio until the page has been interacted with, so the first
   * click or keypress primes the element with a silent play. Failures are
   * ignored: a missing chime must never break the shell.
   */
  useEffect(() => {
    function prime() {
      document.removeEventListener("pointerdown", prime);
      document.removeEventListener("keydown", prime);
      try {
        const el = getChime();
        el.volume = 0;
        void el
          .play()
          .then(() => {
            el.pause();
            el.currentTime = 0;
            el.volume = CHIME_VOLUME;
          })
          .catch(() => {
            el.volume = CHIME_VOLUME;
          });
      } catch {
        // No audio support here — the badge still tells the story.
      }
    }
    document.addEventListener("pointerdown", prime, { once: true });
    document.addEventListener("keydown", prime, { once: true });
    return () => {
      document.removeEventListener("pointerdown", prime);
      document.removeEventListener("keydown", prime);
    };
  }, [getChime]);

  const playChime = useCallback(() => {
    try {
      const el = getChime();
      el.volume = CHIME_VOLUME;
      // Seeking is only legal once the file has metadata; the first ring may be
      // too early, and that is fine — it still plays.
      if (el.readyState > 0) el.currentTime = 0;
      void el.play().catch(() => {});
    } catch {
      // No audio support here — the badge still tells the story.
    }
  }, [getChime]);

  /** Rings once per rise; the count the bell shows is the baseline. */
  const noteCount = useCallback(
    (count: number) => {
      if (seenCount.current === null) {
        seenCount.current = count;
        return false;
      }
      const rose = count > seenCount.current;
      seenCount.current = count;
      if (rose && soundOnRef.current) playChime();
      return rose;
    },
    [playChime],
  );

  // Ring when a navigation brings a higher count than the bell last showed.
  useEffect(() => {
    noteCount(notificationCount);
  }, [notificationCount, noteCount]);

  /**
   * A page that is already open is the common case, so the bell also asks the
   * server every half minute (and whenever the tab comes back). A rise rings the
   * chime and refreshes the list; a fall — someone else decided, or you did —
   * only moves the baseline.
   */
  useEffect(() => {
    let stopped = false;

    async function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { count?: number };
        if (stopped || typeof data.count !== "number") return;
        if (noteCount(data.count)) router.refresh();
      } catch {
        // Offline, or the endpoint is missing — the next tick tries again.
      }
    }

    const timer = window.setInterval(check, 30_000);
    function onVisible() {
      if (document.visibilityState === "visible") void check();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [noteCount, router]);

  const toggleSound = useCallback(() => {
    const next = !soundOnRef.current;
    soundOnRef.current = next;
    setSoundOn(next);
    try {
      window.localStorage.setItem(SOUND_PREFERENCE_KEY, next ? "on" : "off");
    } catch {
      // Storage blocked — the choice holds for this visit only.
    }
    if (next) playChime();
  }, [playChime]);

  const closeAll = useCallback(() => {
    setUserOpen(false);
    setBellOpen(false);
  }, []);

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
    <div ref={shellRef}>
      <header className="sticky top-0 z-50 w-full border-b border-line bg-surface">
        <div className="flex h-16 w-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 xl:px-10">
          <Link
            href="/modules"
            aria-label="TaskTornado — all modules"
            className="flex shrink-0 items-center rounded transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2"
          >
            <Wordmark height={21} priority />
          </Link>

          <div className="flex items-center gap-1">
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
                }}
                aria-expanded={bellOpen}
                aria-label={
                  notificationCount > 0
                    ? `Notifications, ${notificationCount} waiting on you`
                    : "Notifications"
                }
                className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-[#f5f7fb] hover:text-navy"
              >
                <Bell className="h-4 w-4" aria-hidden />
                {notificationCount > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[9px] font-semibold text-navy">
                    {notificationCount > 9 ? "9+" : notificationCount}
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
                    <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                      <p className="text-[12.5px] font-semibold text-navy">Notifications</p>
                      <button
                        type="button"
                        onClick={toggleSound}
                        aria-pressed={soundOn}
                        aria-label={
                          soundOn ? "Turn the notification sound off" : "Turn the notification sound on"
                        }
                        title={soundOn ? "Sound on" : "Sound off"}
                        className="flex h-7 w-7 items-center justify-center rounded text-muted transition hover:bg-[#f5f7fb] hover:text-navy"
                      >
                        {soundOn ? (
                          <Volume2 className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <VolumeX className="h-3.5 w-3.5" aria-hidden />
                        )}
                      </button>
                    </div>
                    {notifications.length === 0 ? (
                      <p className="px-4 py-6 text-center text-[12.5px] text-muted">
                        You’re all caught up.
                      </p>
                    ) : (
                      <ul className="max-h-[280px] overflow-y-auto py-1">
                        {notifications.map((item) => (
                          <li key={`${item.kind}-${item.id}`}>
                            <Link
                              href={item.href}
                              className="block px-4 py-2.5 transition hover:bg-[#f5f7fb]"
                            >
                              <span className="block text-[12.5px] font-medium text-navy">
                                {item.title}
                              </span>
                              <span className="mt-0.5 block text-[11.5px] text-muted">
                                {item.kind === "Patching"
                                  ? "Patching sign-off · awaiting your decision"
                                  : "Request · awaiting a decision"}
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
          </div>
        </div>
      </header>

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
