"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import {
  createTicketCalendar,
  createTicketSla,
  deleteTicketCalendar,
  deleteTicketSla,
  listTicketCalendars,
  listTicketSlas,
  setTicketCalendarStatus,
  setTicketSlaStatus,
} from "@/lib/records/repository";
import {
  calendarError,
  slaError,
  timeToMinutes,
} from "@/lib/tickets/sla";
import { isTicketPriority, type TicketPriority } from "@/lib/tickets/core";

function revalidate() {
  revalidatePath("/modules/masters");
  revalidatePath("/modules/masters/slas");
  revalidatePath("/modules/tickets");
}

function minutesField(formData: FormData, name: string): number {
  const parsed = Number(String(formData.get(name) ?? "").trim());
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

export async function addTicketSlaAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) {
    return { error: "Your role cannot change master data." };
  }

  const name = String(formData.get("name") ?? "").replace(/\s+/g, " ").trim();
  const queueId = String(formData.get("queueId") ?? "").trim() || null;
  const rawPriority = String(formData.get("priority") ?? "").trim();
  const calendarId = String(formData.get("calendarId") ?? "").trim();
  const firstResponseMinutes = minutesField(formData, "firstResponseMinutes");
  const resolveMinutes = minutesField(formData, "resolveMinutes");

  const calendars = await listTicketCalendars(true);
  const calendar = calendars.find((item) => item.id === calendarId) ?? calendars[0];

  const error =
    slaError({ name, firstResponseMinutes, resolveMinutes }) ??
    (calendar ? null : "Add a business shift first — a target needs a clock to run on.") ??
    (name && (await listTicketSlas(true)).some(
      (rule) => rule.name.trim().toLowerCase() === name.toLowerCase(),
    )
      ? `"${name}" is already a service target.`
      : null);
  if (error) return { error };

  try {
    await createTicketSla({
      name,
      queueId,
      priority: isTicketPriority(rawPriority) ? (rawPriority as TicketPriority) : null,
      firstResponseMinutes,
      resolveMinutes,
      calendarId: calendar!.id,
    });
  } catch (cause) {
    console.error("[ticket-slas] create failed", cause);
    return { error: "The service target could not be saved. Please try again." };
  }

  revalidate();
  return { ok: true, message: `"${name}" is now a service target.` };
}

export async function addTicketCalendarAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) {
    return { error: "Your role cannot change master data." };
  }

  const name = String(formData.get("name") ?? "").replace(/\s+/g, " ").trim();
  const days = formData
    .getAll("days")
    .map((value) => Number(String(value)))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  const startMinute = timeToMinutes(String(formData.get("start") ?? ""));
  const endMinute = timeToMinutes(String(formData.get("end") ?? ""));
  const offsetRaw = String(formData.get("offset") ?? "").trim();
  const utcOffsetMinutes = offsetRaw ? Number(offsetRaw) : 330;

  const error =
    calendarError({ name, days, startMinute, endMinute }) ??
    (Number.isFinite(utcOffsetMinutes) && utcOffsetMinutes >= -720 && utcOffsetMinutes <= 840
      ? null
      : "The UTC offset has to be between -720 and 840 minutes.") ??
    ((await listTicketCalendars(true)).some(
      (calendar) => calendar.name.trim().toLowerCase() === name.toLowerCase(),
    )
      ? `"${name}" is already a shift.`
      : null);
  if (error) return { error };

  try {
    await createTicketCalendar({
      name,
      utcOffsetMinutes,
      days: [...new Set(days)].sort((a, b) => a - b),
      startMinute: startMinute!,
      endMinute: endMinute!,
    });
  } catch (cause) {
    console.error("[ticket-calendars] create failed", cause);
    return { error: "The shift could not be saved. Please try again." };
  }

  revalidate();
  return { ok: true, message: `"${name}" is now a shift.` };
}

export async function slaRowAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) return;

  const id = String(formData.get("id") ?? "").trim();
  const value = String(formData.get("value") ?? "");
  const kind = String(formData.get("kind") ?? "sla") === "calendar" ? "calendar" : "sla";
  if (!id) return;

  try {
    if (value === "toggle") {
      if (kind === "calendar") {
        const calendar = (await listTicketCalendars(true)).find((item) => item.id === id);
        if (calendar) {
          await setTicketCalendarStatus(id, calendar.status === "active" ? "inactive" : "active");
        }
      } else {
        const rule = (await listTicketSlas(true)).find((item) => item.id === id);
        if (rule) await setTicketSlaStatus(id, rule.status === "active" ? "inactive" : "active");
      }
    } else if (value === "delete") {
      if (kind === "calendar") await deleteTicketCalendar(id);
      else await deleteTicketSla(id);
    } else {
      return;
    }
  } catch (cause) {
    console.error("[ticket-slas] row action failed", cause);
    return;
  }

  revalidate();
}
