import { Check, CircleDashed, Compass } from "lucide-react";
import type { ModuleDefinition } from "@/lib/modules";

const ROADMAP: Record<string, { phase: string; items: string[] }[]> = {
  clients: [
    { phase: "Milestone 2", items: ["Client master CRUD", "Contacts & environments", "Link tickets, tasks & renewals"] },
    { phase: "Milestone 3", items: ["Ownership model", "Client health score", "Bulk import from CSV"] },
  ],
  patching: [
    { phase: "Milestone 2", items: ["Monthly patch plan builder", "Server group targeting", "Pre/post compliance snapshots"] },
    { phase: "Milestone 3", items: ["Action1 patch status sync", "Exception approvals", "Missed-window escalation"] },
  ],
  approvals: [
    { phase: "Milestone 2", items: ["Change & access request forms", "Approval inbox for leadership", "Decision reason + audit trail"] },
    { phase: "Milestone 3", items: ["Multi-step approvals", "Email + in-app notifications", "SLA on pending approvals"] },
  ],
  renewals: [
    { phase: "Milestone 2", items: ["Renewal register with owners", "30/60/90-day reminders", "Cost & vendor tracking"] },
    { phase: "Milestone 3", items: ["Calendar view", "Notice-period alerts", "Renewal approval hand-off"] },
  ],
};

export function RoadmapPanel({ module }: { module: ModuleDefinition }) {
  const phases = ROADMAP[module.id] ?? [
    { phase: "Next milestone", items: ["Data model & API", "Primary workflow", "Role-aware permissions"] },
  ];

  return (
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
      <div className="rounded-2xl border border-line/70 bg-surface/50 p-5">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <Compass className="h-4 w-4 text-brand-soft" aria-hidden />
          What this module will do
        </h3>
        <ul className="mt-3 space-y-2">
          {module.highlights.map((highlight) => (
            <li key={highlight} className="flex items-start gap-2 text-[12.5px] text-muted">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
              {highlight}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-line/70 bg-surface/50 p-5">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <CircleDashed className="h-4 w-4 text-muted" aria-hidden />
          Build plan
        </h3>
        <div className="mt-3 space-y-3">
          {phases.map((phase) => (
            <div key={phase.phase}>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-soft/80">
                {phase.phase}
              </p>
              <ul className="mt-1 space-y-1">
                {phase.items.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-[12.5px] text-muted">
                    <span className="h-1 w-1 rounded-full bg-line" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
