"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Check, Lock, Search, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { ModuleGlyph } from "@/components/module-glyph";

export type GridModule = {
  id: string;
  title: string;
  href: string;
  tagline: string;
  description: string;
  icon: string;
  accent: string;
  canView: boolean;
  capabilities: string[];
};

const FILTERS = [
  { id: "all", label: "All modules" },
  { id: "available", label: "Available to me" },
  { id: "restricted", label: "Restricted" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.05 } },
};

const card = {
  hidden: { opacity: 0, y: 26, scale: 0.965 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export function ModuleGrid({ modules }: { modules: GridModule[] }) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return modules.filter((module) => {
      if (filter === "available" && !module.canView) return false;
      if (filter === "restricted" && module.canView) return false;
      if (!q) return true;
      return (
        module.title.toLowerCase().includes(q) ||
        module.tagline.toLowerCase().includes(q) ||
        module.description.toLowerCase().includes(q)
      );
    });
  }, [modules, filter, query]);

  const availableCount = modules.filter((m) => m.canView).length;

  return (
    <section aria-labelledby="modules-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="modules-heading" className="text-[17px] font-semibold tracking-tight text-ink">
            Your modules
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {availableCount} of {modules.length} available for your role. Restricted modules stay
            visible so you know who to ask.
          </p>
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-[190px]">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a module"
              aria-label="Search modules"
              className="w-full rounded-lg border border-line bg-surface/70 py-1.5 pl-8 pr-2.5 text-[12px] text-ink placeholder:text-muted/60 focus:border-brand/60 focus:outline-none"
            />
          </div>
          <div className="flex rounded-lg border border-line bg-surface/70 p-0.5">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                aria-pressed={filter === option.id}
                className={clsx(
                  "relative rounded-md px-2.5 py-1 text-[11px] font-medium transition",
                  filter === option.id ? "text-white" : "text-muted hover:text-ink",
                )}
              >
                {filter === option.id && (
                  <motion.span
                    layoutId="grid-filter"
                    className="absolute inset-0 rounded-md bg-brand/80"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative">
                  {option.id === "all"
                    ? "All"
                    : option.id === "available"
                      ? "Mine"
                      : "Locked"}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <motion.ul
        key={`${filter}-${query}`}
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3"
      >
        <AnimatePresence mode="popLayout">
          {filtered.map((module) => {
            const locked = !module.canView;
            const body = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={clsx(
                      "relative flex h-11 w-11 items-center justify-center rounded-xl border transition-transform duration-300",
                      locked
                        ? "border-line/60 bg-surface-2 grayscale"
                        : "border-white/10 bg-white/[0.04] group-hover:-translate-y-0.5",
                    )}
                    style={
                      locked
                        ? undefined
                        : {
                            boxShadow: `0 10px 30px -16px ${module.accent}`,
                            color: module.accent,
                          }
                    }
                  >
                    <ModuleGlyph name={module.icon} className="h-5 w-5" />
                  </span>

                  <span
                    className={clsx(
                      "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-wide",
                      locked
                        ? "border-line bg-surface-2 text-muted"
                        : "border-success/25 bg-success/10 text-success",
                    )}
                  >
                    {locked ? <Lock className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                    {locked ? "Restricted" : "Access"}
                  </span>
                </div>

                <div className="mt-4">
                  <h3 className="flex items-center gap-1.5 text-[14.5px] font-semibold text-ink">
                    {module.title}
                    {!locked && (
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted opacity-0 transition group-hover:opacity-100" />
                    )}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted">
                    {module.tagline}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  {module.capabilities.map((capability) => (
                    <span
                      key={capability}
                      className={clsx(
                        "rounded-md px-1.5 py-0.5 text-[10px] font-medium capitalize",
                        locked
                          ? "bg-surface-2 text-muted/60"
                          : "bg-surface-2 text-muted ring-1 ring-inset ring-line/60",
                      )}
                    >
                      {capability}
                    </span>
                  ))}
                </div>

                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition group-hover:opacity-100" />
              </>
            );

            return (
              <motion.li key={module.id} variants={card} layout>
                {locked ? (
                  <div
                    aria-disabled
                    className="group relative h-full overflow-hidden rounded-2xl border border-line/70 bg-surface/40 p-4 opacity-70"
                    title="Your role does not have access to this module"
                  >
                    {body}
                    <div className="mt-3 flex items-center gap-1.5 text-[10.5px] text-muted/70">
                      <ShieldAlert className="h-3 w-3" aria-hidden />
                      Ask a manager or IT for access
                    </div>
                  </div>
                ) : (
                  <Link
                    href={module.href}
                    className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line/80 bg-surface/70 p-4 transition duration-300 hover:-translate-y-1 hover:border-white/15 hover:bg-surface-2/80 focus-visible:-translate-y-1"
                    style={{ boxShadow: "0 18px 40px -34px rgba(0,0,0,0.9)" }}
                  >
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full opacity-0 blur-3xl transition duration-500 group-hover:opacity-30"
                      style={{ backgroundColor: module.accent }}
                    />
                    {body}
                  </Link>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </motion.ul>

      {filtered.length === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-line bg-surface/40 p-10 text-center">
          <p className="text-[13px] font-medium text-ink">No modules match that filter</p>
          <p className="mt-1 text-[12px] text-muted">
            Try a different search term or switch back to “All modules”.
          </p>
        </div>
      )}
    </section>
  );
}
