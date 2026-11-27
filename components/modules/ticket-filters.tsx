"use client";

import Link from "next/link";
import { AlertCircle, BookmarkPlus, CheckCircle2, Loader2, X } from "lucide-react";
import { useActionState, useState } from "react";
import type { FormState } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { TICKET_PRIORITIES, TICKET_STATES, type TicketFilters } from "@/lib/tickets/core";
import type { TicketOverviewRecord, TicketQueueRecord } from "@/lib/records/repository";
import {
  deleteTicketOverviewAction,
  saveTicketOverviewAction,
} from "@/app/(app)/modules/tickets/actions";

const OWNER_OPTIONS = [
  { value: "", label: "Any owner" },
  { value: "me", label: "Owned by me" },
  { value: "unassigned", label: "Unassigned" },
];

/**
 * Filter bar plus the saved-overviews strip. Filtering is a plain GET form so
 * the URL is always shareable; saving posts the same values to a server action.
 */
export function TicketFilters({
  view,
  filters,
  queues,
  overviews,
  activeOverviewId,
}: {
  view: string;
  filters: TicketFilters;
  queues: TicketQueueRecord[];
  overviews: TicketOverviewRecord[];
  activeOverviewId?: string;
}) {
  const [state, formAction, pending] = useActionState(saveTicketOverviewAction, {} as FormState);
  const [saving, setSaving] = useState(false);
  const dirty = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-3">
      <form
        method="get"
        action="/modules/tickets"
        className="flex flex-wrap items-end gap-2 border border-line bg-surface px-4 py-3"
      >
        <input type="hidden" name="view" value={view} />

        <div>
          <label htmlFor="f-queue" className="field-label">
            Queue
          </label>
          <select id="f-queue" name="queue" defaultValue={filters.queue ?? ""} className="field h-8 w-auto text-[12px]">
            <option value="">All queues</option>
            {queues.map((queue) => (
              <option key={queue.id} value={queue.id}>
                {queue.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="f-state" className="field-label">
            State
          </label>
          <select
            id="f-state"
            name="state"
            defaultValue={filters.state ?? ""}
            className="field h-8 w-auto text-[12px]"
          >
            <option value="">Any state</option>
            {TICKET_STATES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="f-priority" className="field-label">
            Priority
          </label>
          <select
            id="f-priority"
            name="priority"
            defaultValue={filters.priority ?? ""}
            className="field h-8 w-auto text-[12px]"
          >
            <option value="">Any priority</option>
            {TICKET_PRIORITIES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="f-owner" className="field-label">
            Owner
          </label>
          <select
            id="f-owner"
            name="owner"
            defaultValue={filters.owner ?? ""}
            className="field h-8 w-auto text-[12px]"
          >
            {OWNER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[130px] flex-1 sm:max-w-[180px]">
          <label htmlFor="f-tag" className="field-label">
            Tag
          </label>
          <input
            id="f-tag"
            name="tag"
            defaultValue={filters.tag ?? ""}
            placeholder="vpn"
            className="field h-8 text-[12px]"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" variant="secondary">
            Apply
          </Button>
          {dirty && (
            <Link
              href={view === "mine" ? "/modules/tickets" : `/modules/tickets?view=${view}`}
              className="text-[11.5px] text-muted underline-offset-2 hover:text-navy hover:underline"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {overviews.length > 0 && (
        <ul className="flex flex-wrap items-center gap-1.5" aria-label="Saved overviews">
          {overviews.map((overview) => {
            const current = overview.id === activeOverviewId;
            return (
              <li key={overview.id} className="group inline-flex items-center">
                <Link
                  href={`/modules/tickets?view=${view}&overview=${overview.id}`}
                  aria-current={current ? "true" : undefined}
                  className={
                    current
                      ? "inline-flex items-center gap-1.5 border border-gold bg-[#fbf7ec] px-2.5 py-1 text-[11.5px] font-medium text-navy"
                      : "inline-flex items-center gap-1.5 border border-line bg-surface px-2.5 py-1 text-[11.5px] text-body transition-colors hover:border-navy/30 hover:text-navy"
                  }
                >
                  {overview.name}
                </Link>
                <form action={deleteTicketOverviewAction}>
                  <input type="hidden" name="id" value={overview.id} />
                  <button
                    type="submit"
                    aria-label={`Delete the ${overview.name} overview`}
                    className="ml-0.5 p-0.5 text-[#b9c4d6] opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      {dirty && (
        <div>
          {saving ? (
            <form action={formAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="queue" value={filters.queue ?? ""} />
              <input type="hidden" name="state" value={filters.state ?? ""} />
              <input type="hidden" name="priority" value={filters.priority ?? ""} />
              <input type="hidden" name="tag" value={filters.tag ?? ""} />
              <input type="hidden" name="owner" value={filters.owner ?? ""} />
              <div>
                <label htmlFor="overviewName" className="field-label">
                  Name this view
                </label>
                <input
                  id="overviewName"
                  name="name"
                  required
                  minLength={2}
                  maxLength={40}
                  placeholder="e.g. My urgent VPN tickets"
                  className="field h-8 w-56 text-[12px]"
                />
              </div>
              <Button type="submit" size="sm" disabled={pending}>
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                Save
              </Button>
              <button
                type="button"
                onClick={() => setSaving(false)}
                className="pb-2 text-[11.5px] text-muted hover:text-navy"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setSaving(true)}
              className="inline-flex items-center gap-1.5 text-[11.5px] text-navy underline-offset-2 hover:underline"
            >
              <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
              Save this view as an overview
            </button>
          )}

          {state.error && (
            <p role="alert" className="mt-2 flex items-start gap-2 text-[11.5px] text-danger">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {state.error}
            </p>
          )}
          {state.ok && state.message && (
            <p role="status" className="mt-2 flex items-start gap-2 text-[11.5px] text-success">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {state.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
