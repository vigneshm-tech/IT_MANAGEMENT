import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/modules/access-denied";
import { ApprovalsView } from "@/components/modules/approvals-view";
import { ClientsView } from "@/components/modules/clients-view";
import { PatchingView } from "@/components/modules/patching-view";
import { RenewalsView } from "@/components/modules/renewals-view";
import { ServersView } from "@/components/modules/servers-view";
import { SettingsView } from "@/components/modules/settings-view";
import { TasksView } from "@/components/modules/tasks-view";
import { TicketsView } from "@/components/modules/tickets-view";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { integrationStatus } from "@/lib/integrations/store";
import { getModule } from "@/lib/modules";
import {
  listApprovals,
  listClients,
  listPatchPlans,
  listRenewals,
} from "@/lib/records/repository";
import { listTasks } from "@/lib/tasks/repository";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ new?: string }>;
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
      const [{ new: openNew }, tasks] = await Promise.all([searchParams, listTasks()]);
      return <TasksView user={user} tasks={tasks} autoOpen={openNew === "1"} />;
    }

    case "tickets":
      return <TicketsView status={integrationStatus(user.id, "redmine")} />;

    case "servers":
      return <ServersView user={user} status={integrationStatus(user.id, "action1")} />;

    case "clients": {
      const clients = await listClients();
      return <ClientsView user={user} clients={clients} />;
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

    case "settings":
      return (
        <SettingsView
          user={user}
          redmine={integrationStatus(user.id, "redmine")}
          action1={integrationStatus(user.id, "action1")}
          canManageAction1={user.role === "it_manager" || user.role === "it_engineer"}
        />
      );

    default:
      notFound();
  }
}
