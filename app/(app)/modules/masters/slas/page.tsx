import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarClock, Timer } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { AccessDenied } from "@/components/modules/access-denied";
import { TicketCalendarForm, TicketSlaForm } from "@/components/modules/ticket-sla-form";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import {
  listTicketCalendars,
  listTicketQueues,
  listTicketSlas,
} from "@/lib/records/repository";
import { WEEKDAY_LABELS, minutesToTime, slaSummary } from "@/lib/tickets/sla";
import { formatMinutes } from "@/lib/tickets/core";
import { addTicketCalendarAction, addTicketSlaAction, slaRowAction } from "./actions";

export const metadata: Metadata = { title: "Service targets" };

function RowActions({
  id,
  kind,
  status,
  label,
  deleteHref,
  confirming,
}: {
  id: string;
  kind: "sla" | "calendar";
  status: string;
  label: string;
  deleteHref: string;
  confirming: boolean;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <form action={slaRowAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="value" value="toggle" />
        <button
          type="submit"
          className="text-[11.5px] text-body underline-offset-2 hover:text-navy hover:underline"
        >
          {status === "active" ? "Deactivate" : "Activate"}
        </button>
      </form>
      {confirming ? (
        <form action={slaRowAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="value" value="delete" />
          <span className="text-[11.5px] text-danger">Delete {label}?</span>
          <button
            type="submit"
            className="text-[11.5px] font-medium text-danger underline-offset-2 hover:underline"
          >
            Yes, delete
          </button>
          <Link href="/modules/masters/slas" className="text-[11.5px] text-muted hover:text-navy">
            Cancel
          </Link>
        </form>
      ) : (
        <Link
          href={deleteHref}
          className="text-[11.5px] text-muted underline-offset-2 hover:text-danger hover:underline"
        >
          Delete
        </Link>
      )}
    </div>
  );
}

export default async function ServiceTargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ sla?: string; shift?: string }>;
}) {
  const user = await requireUser();

  if (!canAccessModule(user.role, "masters")) {
    return <AccessDenied moduleTitle="Masters" />;
  }

  const { sla: deleteSla, shift: deleteShift } = await searchParams;
  const [slas, calendars, queues] = await Promise.all([
    listTicketSlas(true),
    listTicketCalendars(true),
    listTicketQueues(),
  ]);
  const canEdit = can(user.role, "masters", "edit");
  const activeSlas = slas.filter((rule) => rule.status === "active").length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Service targets"
        actions={
          <Link href="/modules/masters" className={buttonClass({ variant: "secondary", size: "sm" })}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Masters
          </Link>
        }
      >
        <p className="text-[12.5px] text-muted">
          {activeSlas} active {activeSlas === 1 ? "target" : "targets"} of {slas.length}, measured on{" "}
          {calendars.filter((calendar) => calendar.status === "active").length} active{" "}
          {calendars.length === 1 ? "shift" : "shifts"}. A target is the promise; a shift is the clock the
          promise runs on.
        </p>
      </PageHeader>

      <div className="flex items-start gap-2 border border-line bg-surface px-4 py-3 text-[12px] text-muted">
        <Timer className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Promises are cut when a ticket is raised and stored on it. Changing a target only affects tickets
        raised after the change — a promise already made is not rewritten.
      </div>

      {canEdit ? (
        <TicketSlaForm action={addTicketSlaAction} queues={queues} calendars={calendars} />
      ) : (
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          Your role can read the targets but not change them.
        </p>
      )}

      {slas.length === 0 ? (
        <p className="border border-line bg-surface px-4 py-4 text-[12.5px] text-muted">
          No service targets yet. With none, a ticket still gets a resolution date from its priority.
        </p>
      ) : (
        <ul className="divide-y divide-line border-y border-line bg-surface">
          {slas.map((rule) => (
            <li key={rule.id} className="px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[13px] font-medium text-navy">{rule.name}</span>
                <StatusPill
                  status={rule.status}
                  label={rule.status === "active" ? "Active" : "Inactive"}
                />
                <span className="ml-auto font-mono text-[11px] text-muted">{rule.id}</span>
              </div>
              <p className="mt-1 text-[12px] text-muted">{slaSummary(rule, calendars)}</p>
              <p className="mt-0.5 text-[11.5px] text-muted">
                First reply {formatMinutes(rule.firstResponseMinutes)} · resolved{" "}
                {formatMinutes(rule.resolveMinutes)} of office time
              </p>
              {canEdit && (
                <RowActions
                  id={rule.id}
                  kind="sla"
                  status={rule.status}
                  label="this target"
                  deleteHref={`/modules/masters/slas?sla=${rule.id}`}
                  confirming={deleteSla === rule.id}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="pt-2">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-navy">
          <CalendarClock className="h-4 w-4" aria-hidden />
          Business shifts
        </h2>
        <p className="mt-1 text-[12px] text-muted">
          The office clock. Weekends and evenings are closed time, so a four-hour promise made at 17:00 on
          Friday is not late on Saturday.
        </p>
      </div>

      {canEdit && <TicketCalendarForm action={addTicketCalendarAction} calendars={calendars} />}

      <ul className="divide-y divide-line border-y border-line bg-surface">
        {calendars.map((calendar) => (
          <li key={calendar.id} className="px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[13px] font-medium text-navy">{calendar.name}</span>
              <StatusPill
                status={calendar.status}
                label={calendar.status === "active" ? "Active" : "Inactive"}
              />
              <span className="ml-auto font-mono text-[11px] text-muted">{calendar.id}</span>
            </div>
            <p className="mt-1 text-[12px] text-muted">
              {calendar.days.map((day) => WEEKDAY_LABELS[day]).join(", ")} ·{" "}
              {minutesToTime(calendar.startMinute)}–{minutesToTime(calendar.endMinute)} · UTC
              {calendar.utcOffsetMinutes >= 0 ? "+" : ""}
              {calendar.utcOffsetMinutes / 60}
            </p>
            {canEdit && (
              <RowActions
                id={calendar.id}
                kind="calendar"
                status={calendar.status}
                label="this shift"
                deleteHref={`/modules/masters/slas?shift=${calendar.id}`}
                confirming={deleteShift === calendar.id}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
