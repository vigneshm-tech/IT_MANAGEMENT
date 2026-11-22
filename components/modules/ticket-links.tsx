import Link from "next/link";
import { GitMerge, Link2, X } from "lucide-react";
import type { TicketLinkRecord, TicketRecord } from "@/lib/records/repository";
import { TICKET_LINK_KINDS, linkKindLabel } from "@/lib/tickets/core";
import {
  addTicketLinkAction,
  mergeTicketAction,
  removeTicketLinkAction,
} from "@/app/(app)/modules/tickets/actions";

/** Related / parent / child / duplicate links, plus the merge control. */
export function TicketLinks({
  ticket,
  links,
  tickets,
  canEdit,
}: {
  ticket: TicketRecord;
  links: TicketLinkRecord[];
  /** Every ticket, so a link can show the other side's subject. */
  tickets: TicketRecord[];
  canEdit: boolean;
}) {
  const subjectOf = (id: string) => tickets.find((item) => item.id === id)?.subject ?? "—";
  const mergedInto = links.find((link) => link.ticketId === ticket.id && link.kind === "duplicate");

  return (
    <section className="border border-line bg-surface">
      <header className="flex items-center gap-1.5 border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.09em] text-muted">
          <Link2 className="h-3.5 w-3.5" aria-hidden />
          Linked tickets
        </h2>
      </header>

      {ticket.state === "merged" && mergedInto && (
        <p className="flex items-start gap-2 border-b border-line bg-[#f4f7fc] px-4 py-2.5 text-[12px] text-body">
          <GitMerge className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
          <span>
            Merged into{" "}
            <Link href={`/modules/tickets/${mergedInto.targetId}`} className="font-medium text-navy underline">
              {mergedInto.targetId}
            </Link>
            . Replies continue there.
          </span>
        </p>
      )}

      {links.length === 0 ? (
        <p className="px-4 py-3 text-[12px] text-muted">
          Nothing linked yet. Link the ticket that has the same cause, or merge a duplicate.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {links.map((link) => {
            const outgoing = link.ticketId === ticket.id;
            const otherId = outgoing ? link.targetId : link.ticketId;
            return (
              <li key={link.id} className="group flex items-start gap-2 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-[12.5px]">
                    <Link
                      href={`/modules/tickets/${otherId}`}
                      className="font-mono text-[11.5px] font-medium text-navy underline-offset-2 hover:underline"
                    >
                      {otherId}
                    </Link>
                    <span>{subjectOf(otherId)}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {linkKindLabel(link.kind)}
                    {!outgoing && " · linked from the other ticket"}
                  </p>
                </div>
                {canEdit && (
                  <form action={removeTicketLinkAction}>
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <input type="hidden" name="linkId" value={link.id} />
                    <button
                      type="submit"
                      aria-label={`Remove link to ${otherId}`}
                      className="text-[#b9c4d6] opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && ticket.state !== "merged" && (
        <div className="space-y-2 border-t border-line px-4 py-3">
          <form action={addTicketLinkAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="ticketId" value={ticket.id} />
            <div className="min-w-0 flex-1">
              <label htmlFor="targetId" className="field-label">
                Link another ticket
              </label>
              <div className="flex gap-1.5">
                <input
                  id="targetId"
                  name="targetId"
                  required
                  placeholder="TT-1001"
                  className="field h-8 min-w-0 flex-1 text-[12.5px] font-mono"
                />
                <select
                  name="kind"
                  aria-label="Link type"
                  defaultValue="related"
                  className="field h-8 w-auto text-[12px]"
                >
                  {TICKET_LINK_KINDS.filter((kind) => kind.id !== "duplicate").map((kind) => (
                    <option key={kind.id} value={kind.id}>
                      {kind.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="h-8 shrink-0 border border-line bg-surface px-2.5 text-[11.5px] font-medium text-body transition-colors hover:border-navy/30 hover:text-navy"
            >
              Link
            </button>
          </form>

          <form
            action={mergeTicketAction}
            className="flex items-center gap-1.5 border-t border-dashed border-line pt-2"
          >
            <input type="hidden" name="ticketId" value={ticket.id} />
            <label htmlFor="mergeTarget" className="text-[11.5px] text-muted">
              Merge into
            </label>
            <input
              id="mergeTarget"
              name="targetId"
              required
              placeholder="TT-1002"
              className="field h-7 w-24 text-[11.5px] font-mono"
            />
            <button
              type="submit"
              className="text-[11.5px] font-medium text-danger underline-offset-2 hover:underline"
            >
              Merge
            </button>
            <span className="text-[11px] text-muted">keeps this ticket's history</span>
          </form>
        </div>
      )}
    </section>
  );
}
