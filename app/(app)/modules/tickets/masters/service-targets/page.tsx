import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Timer } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { TicketAdminTabs } from "@/components/modules/ticket-admin-tabs";
import { TicketCalendarForm, TicketSlaForm } from "@/components/modules/ticket-sla-form";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listTicketCalendars, listTicketQueues, listTicketSlas } from "@/lib/records/repository";
import { canConfigureTickets, canReadTicketAdmin } from "@/lib/tickets/admin";
import { formatMinutes } from "@/lib/tickets/core";
import { WEEKDAY_LABELS, minutesToTime, slaSummary } from "@/lib/tickets/sla";
import { saveTicketCalendarAction, saveTicketSlaAction, serviceTargetRowAction } from "./actions";

export const metadata: Metadata = { title: "Targets & shifts" };

const BASE = "/modules/tickets/masters/service-targets";

function RowActions({
  id,
  kind,
  status,
  label,
  editHref,
  deleteHref,
  confirming,
}: {
  id: string;
  kind: "sla" | "calendar";
  status: string;
  label: string;
  editHref: string;
  deleteHref: string;
  confirming: boolean;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <Link
        href={editHref}
        className="text-[11.5px] text-body underline-offset-2 hover:text-navy hover:underline"
      >
        Edit
      </Link>
      <form action={serviceTargetRowAction}>
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
        <form action={serviceTargetRowAction} className="flex items-center gap-2">
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
          <Link href={BASE} className="text-[11.5px] text-muted hover:text-navy">
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
  searchParams: Promise<{
    editSla?: string;
    editShift?: string;
    delSla?: string;
    delShift?: string;
  }>;
}) {
  const user = await requireUser();
  if (!canAccessModule(user.role, "tickets")) {
    return <AccessDenied moduleTitle="Tickets" />;
  }
  if (!canReadTicketAdmin(user.role)) {
    return <AccessDenied moduleTitle="Targets & shifts" />;
  }

  const { editSla, editShift, delSla, delShift } = await searchParams;
  const [slas, calendars, queues] = await Promise.all([
    listTicketSlas(true),
    listTicketCalendars(true),
    listTicketQueues(),
  ]);
  const canEdit = canConfigureTickets(user.role);
  const activeSlas = slas.filter((rule) => rule.status === "active").length;
  const editingSla = editSla ? slas.find((rule) => rule.id === editSla) : undefined;
  const editingShift = editShift ? calendars.find((item) => item.id === editShift) : undefined;

  return (
    <div className="space-y-5">
      <PageHeader title="Targets & shifts">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
          <TicketAdminTabs active="targets" />
          <p className="text-[12px] text-muted">
            {activeSlas} active of {slas.length} · measured on{" "}
            {calendars.filter((calendar) => calendar.status === "active").length} active of{" "}
            {calendars.length} shifts
          </p>
        </div>
      </PageHeader>

      {canEdit ? (
        <TicketSlaForm
          key={editingSla?.id ?? "new-sla"}
          action={saveTicketSlaAction}
          queues={queues}
          calendars={calendars}
          rule={editingSla}
        />
      ) : (
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          Read only — you cannot change targets.
        </p>
      )}

      {slas.length === 0 ? (
        <p className="border border-line bg-surface px-4 py-4 text-[12.5px] text-muted">
          No service targets yet. Priority sets the resolution date.
        </p>
      ) : (
        <ul className="divide-y divide-line border-y border-line bg-surface">
          {slas.map((rule) => (
            <li
              key={rule.id}
              className={
                editingSla?.id === rule.id
                  ? "border-l-2 border-navy px-4 py-3 sm:px-5"
                  : "px-4 py-3 sm:px-5"
              }
            >
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
                  editHref={`${BASE}?editSla=${rule.id}`}
                  deleteHref={`${BASE}?delSla=${rule.id}`}
                  confirming={delSla === rule.id}
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
          Weekends and evenings fall outside office hours.
        </p>
      </div>

      {canEdit && (
        <TicketCalendarForm
          key={editingShift?.id ?? "new-shift"}
          action={saveTicketCalendarAction}
          calendars={calendars}
          calendar={editingShift}
        />
      )}

      <ul className="divide-y divide-line border-y border-line bg-surface">
        {calendars.map((calendar) => (
          <li
            key={calendar.id}
            className={
              editingShift?.id === calendar.id
                ? "border-l-2 border-navy px-4 py-3 sm:px-5"
                : "px-4 py-3 sm:px-5"
            }
          >
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
                editHref={`${BASE}?editShift=${calendar.id}`}
                deleteHref={`${BASE}?delShift=${calendar.id}`}
                confirming={delShift === calendar.id}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
