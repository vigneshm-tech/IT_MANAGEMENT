"use client";

import { motion } from "framer-motion";
import {
  BadgeCheck,
  CalendarClock,
  KeyRound,
  ShieldCheck,
  Users,
} from "lucide-react";
import { TornadoMark, Wordmark } from "@/components/brand";
import { ROLES } from "@/lib/roles";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Role-based access, enforced twice",
    body: "Every page is guarded on the server and in the UI — no role, no route.",
  },
  {
    icon: Users,
    title: "15 roles across 6 teams",
    body: "IT, L2 Support, Implementation, Development, Testing and Management.",
  },
  {
    icon: CalendarClock,
    title: "Task windows that hold",
    body: "Engineers log tasks 09:00–18:00 IST. Leadership stays open 24 hours.",
  },
  {
    icon: KeyRound,
    title: "Your integrations, your keys",
    body: "Redmine and Action1 credentials are stored per employee, not shared.",
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
};

export function BrandPanel() {
  const marqueeRoles = [...ROLES, ...ROLES];

  return (
    <motion.section
      variants={container}
      initial="hidden"
      animate="show"
      className="relative hidden flex-col justify-between overflow-hidden px-10 py-12 lg:flex xl:px-16"
    >
      <motion.div variants={item}>
        <Wordmark />
      </motion.div>

      <div className="relative max-w-xl">
        <motion.div
          variants={item}
          className="mb-7 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3.5 py-1.5 text-xs font-medium text-brand-soft"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-brand-soft opacity-70 animate-pulse-ring" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-soft" />
          </span>
          Role-based access control
        </motion.div>

        <motion.h1
          variants={item}
          className="text-5xl font-semibold leading-[1.04] tracking-tight text-gradient xl:text-6xl"
        >
          IT operations,
          <br />
          spinning perfectly.
        </motion.h1>

        <motion.p variants={item} className="mt-5 max-w-md text-[15px] leading-relaxed text-muted">
          One place for tasks, tickets, servers, clients, patching, approvals and
          renewals — with the access rules your teams already follow.
        </motion.p>

        <motion.div variants={item} className="mt-8 flex items-center gap-5">
          <div className="relative">
            <div className="absolute inset-0 -z-10 rounded-3xl bg-brand/30 blur-2xl" />
            <TornadoMark className="h-16 w-16 drop-shadow-[0_10px_30px_rgba(124,92,255,0.45)]" />
          </div>
          <div className="grid grid-cols-3 gap-6 text-sm">
            <div>
              <div className="text-2xl font-semibold text-ink">15</div>
              <div className="text-[11px] uppercase tracking-wider text-muted">Roles</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-ink">9</div>
              <div className="text-[11px] uppercase tracking-wider text-muted">Modules</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-ink">24/7</div>
              <div className="text-[11px] uppercase tracking-wider text-muted">Oversight</div>
            </div>
          </div>
        </motion.div>

        <motion.ul variants={item} className="mt-10 space-y-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2/70 text-brand-soft">
                <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              </span>
              <div>
                <p className="text-[13.5px] font-medium text-ink/90">{title}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{body}</p>
              </div>
            </li>
          ))}
        </motion.ul>
      </div>

      <motion.div variants={item} className="mt-10">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
          Built for every team
        </div>
        <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
          <div className="flex w-max gap-2 [animation:marquee_38s_linear_infinite] motion-reduce:[animation:none]">
            {marqueeRoles.map((role, index) => (
              <span
                key={`${role.id}-${index}`}
                className="whitespace-nowrap rounded-full border border-line bg-surface-2/60 px-3 py-1.5 text-[11.5px] text-muted"
              >
                {role.label}
              </span>
            ))}
          </div>
        </div>
        <style>{`
          @keyframes marquee {
            from { transform: translateX(0); }
            to { transform: translateX(-50%); }
          }
        `}</style>
      </motion.div>
    </motion.section>
  );
}
