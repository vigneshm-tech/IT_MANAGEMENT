import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/modules/access-denied";
import { ApprovalsView } from "@/components/modules/approvals-view";
import { ClientsView } from "@/components/modules/clients-view";
import { MastersView } from "@/components/modules/masters-view";
import { PatchingView } from "@/components/modules/patching-view";
import { RenewalsView } from "@/components/modules/renewals-view";
import { isServersFilter, ServersView } from "@/components/modules/servers-view";
import { TasksView } from "@/components/modules/tasks-view";
import { TicketsView } from "@/components/modules/tickets-view";
import { can, canAccessModule } from "@/lib/access";
import { canSyncRedmineClients } from "@/lib/integrations/access";
import { getIntegration } from "@/lib/integrations/store";
import { approvalView } from "@/lib/approvals/views";
import { resolveClientTab } from "@/lib/clients";
import { parseTicketFilters } from "@/lib/tickets/core";
import { readClientCatalogue } from "@/lib/tickets/redmine-clients";
import { requireUser } from "@/lib/auth";
import { loadServersInventory } from "@/lib/servers/inventory";
import { getModule } from "@/lib/modules";
import {
  listActivityTypes,
  listApprovals,
  listClients,
  listCustomFields,
  listAssignableUsers,
  listIndustries,
  listPatchInbox,
  listPatchSchedules,
  listRenewals,
  listRequestTypes,
  listTicketOverviews,
  listTicketQueues,
  listTicketTaskCounts,
  listTickets,
} from "@/lib/records/repository";
import { listTasks } from "@/lib/tasks/repository";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    new?: string;
    view?: string;
    created?: string;
    updated?: string;
    page?: string;
    /** Ticket filters, also stored by a saved overview. */
    queue?: string;
    state?: string;
    priority?: string;
    tag?: string;
    owner?: string;
    overview?: string;
  }>;
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
      const [{ view, created, overview, ...rest }, tickets, taskCounts, overviews, queues] =
        await Promise.all([
          searchParams,
          listTickets(),
          listTicketTaskCounts(),
          listTicketOverviews(user.id),
          listTicketQueues(),
        ]);
      // A pinned overview replaces the ad-hoc filters with its saved ones.
      const activeOverview = overview
        ? overviews.find((item) => item.id === overview)
        : undefined;
      const filters = activeOverview ? activeOverview.filters : parseTicketFilters(rest);
      return (
        <TicketsView
          user={user}
          tickets={tickets}
          taskCounts={taskCounts}
          view={view}
          created={created}
          agent={can(user.role, "tickets", "edit")}
          filters={filters}
          queues={queues}
          overviews={overviews}
          activeOverviewId={activeOverview?.id}
        />
      );
    }

    case "servers": {
      const [{ view, page }, inventory] = await Promise.all([
        searchParams,
        loadServersInventory(user.id),
      ]);
      return (
        <ServersView
          user={user}
          inventory={inventory}
          filter={isServersFilter(view) ? view : "all"}
          page={Number.parseInt(page ?? "1", 10) || 1}
        />
      );
    }

    case "clients": {
      // Both lists live on this page: the register we maintain, and the client
      // list Redmine already has. The captured list also decides which one to
      // open when the address does not say.
      const [{ created, updated, view }, clients, catalogue] = await Promise.all([
        searchParams,
        listClients(),
        readClientCatalogue(),
      ]);
      const tab = resolveClientTab(view, clients.length, catalogue.clients.length);
      const redmine = tab === "redmine" ? await getIntegration(user.id, "redmine") : null;

      return (
        <ClientsView
          user={user}
          clients={clients}
          createdId={created}
          updatedId={updated}
          tab={tab}
          catalogue={catalogue}
          redmineConnected={Boolean(redmine?.baseUrl)}
          canSync={canSyncRedmineClients(user.role)}
        />
      );
    }

    case "patching": {
      const [inventory, schedules, people] = await Promise.all([
        loadServersInventory(user.id),
        listPatchSchedules(),
        listAssignableUsers(),
      ]);
      return (
        <PatchingView
          user={user}
          title={module.title}
          inventory={inventory}
          schedules={schedules}
          people={people}
          canEdit={can(user.role, "patching", "edit")}
        />
      );
    }

    case "approvals": {
      // Patch plans a named approver still has to answer live here next to the
      // request approvals — the same person may never open Patching Plans.
      const [{ view }, approvals, patchApprovals, plans, people] = await Promise.all([
        searchParams,
        listApprovals(),
        listPatchInbox(user.id),
        // Every plan, so the Approved and Rejected tabs also list the patch
        // sign-offs that have been decided — not only the requests.
        listPatchSchedules(),
        listAssignableUsers(),
      ]);
      return (
        <ApprovalsView
          user={user}
          approvals={approvals}
          view={approvalView(view)}
          plans={plans}
          patchApprovals={patchApprovals}
          people={people}
          requestTypes={await listRequestTypes()}
        />
      );
    }

    case "renewals":
      return <RenewalsView user={user} renewals={await listRenewals()} />;

    case "masters": {
      const [activityTypes, industries, requestTypes, customFields] = await Promise.all([
        listActivityTypes(),
        listIndustries(),
        listRequestTypes(),
        listCustomFields(),
      ]);
      return (
        <MastersView
          user={user}
          counts={{
            activityTypes: activityTypes.length,
            industries: industries.length,
            requestTypes: requestTypes.length,
            customFields: customFields.length,
          }}
        />
      );
    }

    default:
      notFound();
  }
}
