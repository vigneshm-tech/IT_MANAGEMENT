import { Zap } from "lucide-react";
import type { TicketMacroRecord } from "@/lib/records/repository";
import { macroSummary } from "@/lib/tickets/core";
import { applyTicketMacroAction } from "@/app/(app)/modules/tickets/actions";

/** Zammad's macros: one action, a bundle of changes, one line in the thread. */
export function TicketMacroForm({
  ticketId,
  macros,
}: {
  ticketId: string;
  macros: TicketMacroRecord[];
}) {
  if (macros.length === 0) return null;

  return (
    <form action={applyTicketMacroAction} className="border border-line bg-surface px-4 py-3">
      <label
        htmlFor="macroId"
        className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.09em] text-muted"
      >
        <Zap className="h-3.5 w-3.5" aria-hidden />
        Macro
      </label>
      <input type="hidden" name="ticketId" value={ticketId} />
      <div className="mt-2 flex items-center gap-1.5">
        <select id="macroId" name="macroId" defaultValue={macros[0].id} className="field h-8 min-w-0 flex-1 text-[12px]">
          {macros.map((macro) => (
            <option key={macro.id} value={macro.id}>
              {macro.name} — {macroSummary(macro)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-8 shrink-0 border border-navy bg-navy px-2.5 text-[11.5px] font-medium text-white transition-colors hover:bg-navy-soft"
        >
          Apply
        </button>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-muted">
        The change is recorded in the thread.
      </p>
    </form>
  );
}
