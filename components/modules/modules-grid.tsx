"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { ModuleGlyph } from "@/components/module-glyph";
import type { NavGroupId } from "@/lib/modules";

export type ModuleCard = {
  id: string;
  title: string;
  href: string;
  summary: string;
  icon: string;
  navGroup: NavGroupId;
};

const EASE = [0.22, 1, 0.36, 1] as const;

const ITEM = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: EASE },
  },
};

/**
 * Flat modular launcher.
 *
 * One continuous canvas: the grid itself paints the hairlines through a 1px
 * gap on a line-coloured background, so every section shares an edge with its
 * neighbours instead of sitting in its own card. Empty cells at the end of the
 * last row keep the canvas rectangular at 2 and 3 columns.
 */
export function ModulesGrid({ modules }: { modules: ModuleCard[] }) {
  const desktopFillers = (3 - (modules.length % 3)) % 3;
  const tabletFillers = (2 - (modules.length % 2)) % 2;

  return (
    <motion.ul
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
      }}
      className="grid grid-cols-1 gap-px overflow-hidden rounded-[10px] bg-line sm:grid-cols-2 lg:grid-cols-3"
    >
      {modules.map((module) => (
        <motion.li key={module.id} variants={ITEM} className="bg-surface">
          <Link
            href={module.href}
            className="group relative flex h-full min-h-[196px] flex-col justify-between overflow-hidden bg-surface p-6 transition-colors duration-300 hover:bg-[#f4f7fc] focus-visible:bg-[#f4f7fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/70 active:bg-[#eef3fb] sm:min-h-[224px] sm:p-7"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -bottom-12 -right-12 flex h-[188px] w-[188px] items-center justify-center rounded-full bg-[#eef2f9] transition-all duration-500 ease-out group-hover:scale-110 group-hover:bg-[#e5ecf7]"
            >
              <ModuleGlyph
                name={module.icon}
                strokeWidth={1.1}
                className="h-[92px] w-[92px] -translate-x-1.5 -translate-y-1.5 text-navy/[0.17] transition-transform duration-500 ease-out group-hover:-translate-y-4 group-hover:scale-105 group-hover:text-navy/[0.22]"
              />
            </span>

            <span className="relative z-10 flex justify-end">
              <ArrowUpRight
                aria-hidden
                className="h-4 w-4 text-[#b9c4d6] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-navy"
              />
            </span>

            <h2 className="relative z-10 mt-10 max-w-[86%] text-[24px] font-semibold leading-[1.15] tracking-[-0.02em] text-navy transition-colors duration-300 group-hover:text-[#1f3e77] group-focus-visible:text-[#1f3e77] sm:text-[26px]">
              {module.title}
            </h2>
          </Link>
        </motion.li>
      ))}

      {Array.from({ length: desktopFillers }).map((_, index) => (
        <li
          key={`desktop-filler-${index}`}
          aria-hidden
          className="hidden bg-surface lg:block"
        />
      ))}

      {Array.from({ length: tabletFillers }).map((_, index) => (
        <li
          key={`tablet-filler-${index}`}
          aria-hidden
          className="hidden bg-surface sm:block lg:hidden"
        />
      ))}
    </motion.ul>
  );
}
