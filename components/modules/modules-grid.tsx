"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { ModuleGlyph } from "@/components/module-glyph";
import { NAV_GROUPS, type NavGroupId } from "@/lib/modules";

export type ModuleCard = {
  id: string;
  title: string;
  href: string;
  summary: string;
  icon: string;
  navGroup: NavGroupId;
};

const GROUP_LABEL = Object.fromEntries(NAV_GROUPS.map((group) => [group.id, group.label]));

export function ModulesGrid({ modules }: { modules: ModuleCard[] }) {
  return (
    <motion.ul
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
      }}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
    >
      {modules.map((module) => (
        <motion.li
          key={module.id}
          variants={{
            hidden: { opacity: 0, y: 14 },
            visible: {
              opacity: 1,
              y: 0,
              transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
            },
          }}
        >
          <Link
            href={module.href}
            className="group flex h-full flex-col justify-between rounded-lg border border-line bg-surface p-5 transition duration-200 hover:-translate-y-0.5 hover:border-[#c9d3e4] hover:shadow-[0_10px_28px_-16px_rgba(23,44,82,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2"
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#eef2f8] text-navy transition-colors group-hover:bg-navy group-hover:text-gold">
                  <ModuleGlyph name={module.icon} className="h-[17px] w-[17px]" />
                </span>
                <ArrowUpRight
                  className="h-4 w-4 translate-y-0.5 text-line-strong transition group-hover:-translate-y-0 group-hover:text-gold"
                  aria-hidden
                />
              </div>
              <p className="mt-4 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
                {GROUP_LABEL[module.navGroup] ?? "Workspace"}
              </p>
              <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.01em] text-navy">
                {module.title}
              </h2>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-body">{module.summary}</p>
            </div>
            <span className="mt-5 inline-flex items-center gap-1 text-[11.5px] font-medium text-navy opacity-0 transition group-hover:opacity-100">
              Open
            </span>
          </Link>
        </motion.li>
      ))}
    </motion.ul>
  );
}
