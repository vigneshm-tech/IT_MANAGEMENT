"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import {
  createTicketQueue,
  deleteTicketQueue,
  listTicketQueues,
  updateTicketQueue,
} from "@/lib/records/repository";
import { canConfigureTickets } from "@/lib/tickets/admin";

function revalidate() {
  revalidatePath("/modules/tickets");
  revalidatePath("/modules/tickets/masters");
  revalidatePath("/modules/tickets/masters/queues");
  revalidatePath("/modules/tickets/settings");
  revalidatePath("/support/new");
}

/** A queue is a name, a line of description and whether the public may file into it. */
function queueError(
  input: { name: string; description: string },
  existing: { id: string; name: string }[],
  ignoreId?: string,
): string | null {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (name.length < 2) return "Give the queue a name of at least 2 characters.";
  if (name.length > 60) return "Keep the queue name under 60 characters.";
  if (input.description.length > 200) return "Keep the description under 200 characters.";
  const clash = existing.find(
    (queue) => queue.id !== ignoreId && queue.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (clash) return `"${name}" is already a queue.`;
  return null;
}

export async function saveTicketQueueAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "tickets", "view")) return { error: "You cannot read tickets." };
  if (!canConfigureTickets(user.role)) return { error: "Your role cannot change the queues." };

  const id = String(formData.get("id") ?? "").trim();
  const input = {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? "").trim(),
    isPublic: formData.get("isPublic") === "on" || formData.get("isPublic") === "true",
  };

  const existing = await listTicketQueues(true);
  const error = queueError(input, existing, id || undefined);
  if (error) return { error };

  try {
    if (id) {
      const saved = await updateTicketQueue(id, input);
      if (!saved) return { error: "That queue no longer exists." };
      revalidate();
      return { ok: true, message: `"${input.name.trim()}" was updated.` };
    }
    await createTicketQueue({ ...input, description: input.description });
  } catch (cause) {
    console.error("[ticket-queues] save failed", cause);
    return { error: "The queue could not be saved. Please try again." };
  }

  revalidate();
  return { ok: true, message: `"${input.name.trim()}" is now a queue.` };
}

export async function ticketQueueRowAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!canConfigureTickets(user.role)) return;

  const id = String(formData.get("id") ?? "").trim();
  const value = String(formData.get("value") ?? "");
  if (!id) return;

  try {
    if (value === "toggle") {
      const queue = (await listTicketQueues(true)).find((item) => item.id === id);
      if (queue) {
        await updateTicketQueue(id, {
          status: queue.status === "active" ? "inactive" : "active",
          // A retired queue must not stay on the public form.
          ...(queue.status === "active" ? { isPublic: false } : {}),
        });
      }
    } else if (value === "public") {
      const queue = (await listTicketQueues(true)).find((item) => item.id === id);
      if (queue && queue.status === "active") {
        await updateTicketQueue(id, { isPublic: !queue.isPublic });
      }
    } else if (value === "delete") {
      await deleteTicketQueue(id);
    } else {
      return;
    }
  } catch (cause) {
    console.error("[ticket-queues] row action failed", cause);
    return;
  }

  revalidate();
}
