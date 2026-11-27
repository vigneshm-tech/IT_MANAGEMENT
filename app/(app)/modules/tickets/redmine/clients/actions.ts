"use server";

import { revalidatePath } from "next/cache";
import { canSyncRedmineClients } from "@/lib/integrations/access";
import { requireUser } from "@/lib/auth";
import { runClientSync } from "@/lib/tickets/redmine-clients";

export type ClientSyncState = {
  ok?: boolean;
  error?: string;
  message?: string;
};

/**
 * Sync now.
 *
 * The only path that reads the client list out of Redmine while somebody is
 * watching. It scans the portal project, stores what it found, and answers with
 * a sentence the button can show. A failure is returned rather than thrown: the
 * previous capture stays in place and the message says why the attempt failed.
 */
export async function syncRedmineClientsAction(
  _previous: ClientSyncState,
  _formData: FormData,
): Promise<ClientSyncState> {
  const user = await requireUser();

  // The list is client data read out of Tickets, so either right is enough.
  if (!canSyncRedmineClients(user.role)) {
    return { error: "Your role cannot change clients or tickets, so it cannot refresh this list." };
  }

  const result = await runClientSync(user.id, "manual");
  if (!result.ok) return { error: result.message };

  revalidatePath("/modules/tickets/redmine/clients");
  revalidatePath("/modules/tickets/redmine");
  revalidatePath("/modules/tickets");

  return {
    ok: true,
    message:
      `Synced ${result.clients} client${result.clients === 1 ? "" : "s"} from ` +
      `${result.scanned} ticket${result.scanned === 1 ? "" : "s"}.` +
      (result.truncated ? " Older tickets were left unread." : ""),
  };
}
