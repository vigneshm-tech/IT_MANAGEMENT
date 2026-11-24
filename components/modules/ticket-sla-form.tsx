"use client";

import { AlertCircle, CheckCircle2, Clock, Loader2, Plus, Save, X } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import { TICKET_PRIORITIES } from "@/lib/tickets/core";
import {
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
  minutesToTime,
  type BusinessCalendar,
  type SlaRule,
} from "@/lib/tickets/sla";
import type { TicketQueueRecord } from "@/lib/records/repository";

function Notice({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="mx-4 mb-4 flex items-start gap-2 border border-[#eccfcd] bg-danger-soft px-3 py-2 text-[12.5px] text-danger sm:mx-5"
      >
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {state.error}
      </p>
    );
  }
  if (state.ok && state.message) {
    return (
      <p
        role="status"
        className="mx-4 mb-4 flex items-start gap-2 border border-[#cfe4d4] bg-success-soft px-3 py-2 text-[12.5px] text-success sm:mx-5"
      >
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {state.message}
      </p>
    );
  }
  return null;
}

/** A service target: when to answer, when to finish, and on which clock. */
export function TicketSlaForm({
  action,
  queues,
  calendars,
  rule,
  cancelHref = "/modules/tickets/masters/service-targets",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  queues: TicketQueueRecord[];
  calendars: BusinessCalendar[];
  /** Present when editing an existing promise rather than adding one. */
  rule?: SlaRule;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);

  return (
    <form action={formAction} className="border border-line bg-surface">
      {rule && <input type="hidden" name="id" value={rule.id} />}
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-5">
        <p className="text-[12.5px] font-medium text-navy">
          {rule ? `Editing "${rule.name}"` : "New service target"}
        </p>
        {rule && (
          <Link
            href={cancelHref}
            className="inline-flex items-center gap-1 text-[11.5px] text-muted hover:text-navy"
          >
            <X className="h-3 w-3" aria-hidden />
            Cancel
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-x-5 gap-y-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <div>
          <label htmlFor="sla-name" className="field-label">
            Name<span className="ml-0.5 text-danger">*</span>
          </label>
          <input
            id="sla-name"
            name="name"
            required
            minLength={3}
            maxLength={60}
            defaultValue={rule?.name ?? ""}
            placeholder="e.g. VIP customers"
            className="field"
          />
        </div>
        <div>
          <label htmlFor="sla-calendar" className="field-label">
            Measured on
          </label>
          <select
            id="sla-calendar"
            name="calendarId"
            className="field"
            defaultValue={rule?.calendarId ?? calendars[0]?.id ?? ""}
          >
            {calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sla-queue" className="field-label">
            Queue
          </label>
          <select id="sla-queue" name="queueId" className="field" defaultValue={rule?.queueId ?? ""}>
            <option value="">Any queue</option>
            {queues.map((queue) => (
              <option key={queue.id} value={queue.id}>
                {queue.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sla-priority" className="field-label">
            Priority
          </label>
          <select id="sla-priority" name="priority" className="field" defaultValue={rule?.priority ?? ""}>
            <option value="">Any priority</option>
            {TICKET_PRIORITIES.map((priority) => (
              <option key={priority.id} value={priority.id}>
                {priority.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sla-first" className="field-label">
            First response (business minutes)
          </label>
          <input
            id="sla-first"
            name="firstResponseMinutes"
            type="number"
            min={1}
            max={43200}
            defaultValue={rule?.firstResponseMinutes ?? 480}
            className="field"
          />
        </div>
        <div>
          <label htmlFor="sla-resolve" className="field-label">
            Resolution (business minutes)
          </label>
          <input
            id="sla-resolve"
            name="resolveMinutes"
            type="number"
            min={1}
            max={43200}
            defaultValue={rule?.resolveMinutes ?? 2880}
            className="field"
          />
        </div>
      </div>

      <Notice state={state} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
        <p className="text-[11.5px] text-muted">
          The most specific rule wins. Minutes are office hours.
        </p>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : rule ? (
            <Save className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden />
          )}
          {rule ? "Save target" : "Add target"}
        </Button>
      </div>
    </form>
  );
}

/** A shift: which days, what hours, and which way the clock is offset. */
export function TicketCalendarForm({
  action,
  calendars,
  calendar,
  cancelHref = "/modules/tickets/masters/service-targets",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  calendars: BusinessCalendar[];
  /** Present when editing an existing shift rather than adding one. */
  calendar?: BusinessCalendar;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const offset = calendar?.utcOffsetMinutes ?? calendars[0]?.utcOffsetMinutes ?? 330;
  const workingDays = calendar?.days ?? [1, 2, 3, 4, 5];

  return (
    <form action={formAction} className="border border-line bg-surface">
      {calendar && <input type="hidden" name="id" value={calendar.id} />}
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-5">
        <p className="text-[12.5px] font-medium text-navy">
          {calendar ? `Editing "${calendar.name}"` : "New shift"}
        </p>
        {calendar && (
          <Link
            href={cancelHref}
            className="inline-flex items-center gap-1 text-[11.5px] text-muted hover:text-navy"
          >
            <X className="h-3 w-3" aria-hidden />
            Cancel
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-x-5 gap-y-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <div className="sm:col-span-2">
          <label htmlFor="cal-name" className="field-label">
            Name<span className="ml-0.5 text-danger">*</span>
          </label>
          <input
            id="cal-name"
            name="name"
            required
            minLength={3}
            maxLength={60}
            defaultValue={calendar?.name ?? ""}
            placeholder="e.g. Weekend cover"
            className="field"
          />
        </div>

        <fieldset className="sm:col-span-2">
          <legend className="field-label">Working days</legend>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
            {WEEKDAY_ORDER.map((day) => (
              <label key={day} className="flex items-center gap-1.5 text-[12px] text-body">
                <input
                  type="checkbox"
                  name="days"
                  value={day}
                  defaultChecked={workingDays.includes(day)}
                  className="h-3.5 w-3.5 accent-[#1d3a5f]"
                />
                {WEEKDAY_LABELS[day]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="cal-start" className="field-label">
              Opens
            </label>
            <input
              id="cal-start"
              name="start"
              type="time"
              defaultValue={minutesToTime(calendar?.startMinute ?? calendars[0]?.startMinute ?? 540)}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="cal-end" className="field-label">
              Closes
            </label>
            <input
              id="cal-end"
              name="end"
              type="time"
              defaultValue={minutesToTime(calendar?.endMinute ?? calendars[0]?.endMinute ?? 1080)}
              className="field"
            />
          </div>
        </div>

        <div>
          <label htmlFor="cal-offset" className="field-label">
            UTC offset (minutes)
          </label>
          <input
            id="cal-offset"
            name="offset"
            type="number"
            min={-720}
            max={840}
            defaultValue={offset}
            className="field"
          />
          <p className="mt-1 text-[11px] text-muted">Minutes from UTC — India is 330.</p>
        </div>
      </div>

      <Notice state={state} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
        <p className="flex items-center gap-1.5 text-[11.5px] text-muted">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          A deleted shift is replaced by the first active one.
        </p>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : calendar ? (
            <Save className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden />
          )}
          {calendar ? "Save shift" : "Add shift"}
        </Button>
      </div>
    </form>
  );
}
