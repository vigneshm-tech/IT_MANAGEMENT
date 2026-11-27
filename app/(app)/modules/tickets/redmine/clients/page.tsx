import type { Metadata } from "next";
import { AccessDenied } from "@/components/modules/access-denied";
import { RedmineClientsView } from "@/components/modules/redmine-clients-view";
import { canAccessModule } from "@/lib/access";
import { canSyncRedmineClients } from "@/lib/integrations/access";
import { requireUser } from "@/lib/auth";
import { getIntegration } from "@/lib/integrations/store";
import { listClients } from "@/lib/records/repository";
import { readClientCatalogue } from "@/lib/tickets/redmine-clients";

export const metadata: Metadata = { title: "Redmine clients" };

/**
 * The captured client list. Reads our own tables — the only Redmine call this
 * page may make is the one behind the Sync now button.
 */
export default async function RedmineClientsPage() {
  const user = await requireUser();

  if (!canAccessModule(user.role, "tickets")) {
    return <AccessDenied moduleTitle="Tickets" />;
  }

  const [record, catalogue, clients] = await Promise.all([
    getIntegration(user.id, "redmine"),
    readClientCatalogue(),
    listClients(),
  ]);

  return (
    <RedmineClientsView
      catalogue={catalogue}
      connected={Boolean(record?.baseUrl)}
      canSync={canSyncRedmineClients(user.role)}
      register={clients.map((client) => ({
        id: client.id,
        name: client.name,
        code: client.code,
      }))}
    />
  );
}
