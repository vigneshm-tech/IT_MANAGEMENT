import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/modules/access-denied";
import { ApprovalsView } from "@/components/modules/approvals-view";
import { ClientsView } from "@/components/modules/clients-view";
import { MastersView } from "@/components/modules/masters-view";
import { PatchingView } from "@/components/modules/patching-view";
import { RenewalsView } from "@/components/modules/renewals-view";
import { isServersFilter, ServersView } from "@/components/modules/servers-view";
import { SettingsView } from "@/components/modules/settings-view";
import { TasksView } from "@/components/modules/tasks-view";
import { TicketsView } from "@/components/modules/tickets-view";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { integrationStatus } from "@/lib/integrations/store";
import { canManageAction1 } from "@/lib/integrations/access";
import { loadServersInventory } from "@/lib/servers/inventory";
import { getModule } from "@/lib/modules";
import {
  listActivityTypes,
  listApprovals,
  listClients,
  listCustomFields,
  listIndustries,
  listPatchPlans,
  listRenewals,
} from "@/lib/records/repository";
import { listTasks } from "@/lib/tasks/repository";
import { isTicketView, loadTickets } from "@/lib/tickets/portal";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ new?: string; view?: string; created?: string; updated?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const module = getModule(slug);
  return { title: module?.title ?? "Module" };
}

export default async function ModulePage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const module = getModule(slug);
  if (!module) notFound();

  const user = await requireUser();
  if (!canAccessModule(user.role, module.id)) {
    return <AccessDenied moduleTitle={module.title} />;
  }

  switch (module.id) {
    case "tasks": {
      const [{ view }, tasks] = await Promise.all([searchParams, listTasks()]);
      return <TasksView user={user} tasks={tasks} view={view} />;
    }

    case "tickets": {
      const [{ view, created }] = await Promise.all([searchParams]);
      return (
        <TicketsView
          data={await loadTickets(user.id, isTicketView(view) ? view : "mine")}
          createdId={created}
        />
      );
    }

    case "servers": {
      const [{ view }, inventory] = await Promise.all([
        searchParams,
        loadServersInventory(user.id),
      ]);
      return (
        <ServersView
          user={user}
          inventory={inventory}
          filter={isServersFilter(view) ? view : "all"}
        />
      );
    }

    case "clients": {
      const [{ created, updated }, clients] = await Promise.all([searchParams, listClients()]);
      return (
        <ClientsView user={user} clients={clients} createdId={created} updatedId={updated} />
      );
    }

    case "patching": {
      const [plans, clients] = await Promise.all([listPatchPlans(), listClients()]);
      return (
        <PatchingView
          user={user}
          plans={plans}
          clients={clients.filter((client) => client.status === "active").map((client) => client.name)}
        />
      );
    }

    case "approvals":
      return <ApprovalsView user={user} approvals={await listApprovals()} />;

    case "renewals":
      return <RenewalsView user={user} renewals={await listRenewals()} />;

    case "masters": {
      const [activityTypes, industries, customFields] = await Promise.all([
        listActivityTypes(),
        listIndustries(),
        listCustomFields(),
      ]);
      return (
        <MastersView
          user={user}
          counts={{
            activityTypes: activityTypes.length,
            industries: industries.length,
            customFields: customFields.length,
          }}
        />
      );
    }

    case "settings": {
      const [redmine, action1] = await Promise.all([
        integrationStatus(user.id, "redmine"),
        integrationStatus(user.id, "action1"),
      ]);
      return (
        <SettingsView
          user={user}
          redmine={redmine}
          action1={action1}
          canManageAction1={canManageAction1(user.role)}
        />
      );
    }

    default:
      notFound();
  }
}
