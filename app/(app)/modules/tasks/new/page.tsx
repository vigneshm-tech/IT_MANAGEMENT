import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TaskForm } from "@/components/modules/task-form";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import {
  listActiveActivityTypes,
  listAssignableUsers,
  listClients,
} from "@/lib/records/repository";
import { peopleOptions } from "@/lib/tasks/options";
import { listServerOptions } from "@/lib/servers/inventory";
import { taskWindowFor } from "@/lib/task-window";

export const metadata: Metadata = { title: "New task" };

export default async function NewTaskPage() {
  const user = await requireUser();
  if (!can(user.role, "tasks", "create")) redirect("/modules/tasks");

  const window = taskWindowFor(user.role);

  if (!window.canCreate) {
    return (
      <div className="space-y-4">
        <PageHeader title="New task" />
        <div className="flex items-start gap-3 border border-[#ecd9b6] bg-warning-soft px-4 py-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-[#7b5c1d]">
            Tasks can be raised between {window.message}. You can still pick up and close
            existing work outside the window.
          </p>
        </div>
      </div>
    );
  }

  const [clients, activityTypes, people, servers] = await Promise.all([
    listClients().then((items) =>
      items.filter((client) => client.status === "active").map((client) => client.name),
    ),
    listActiveActivityTypes("tasks"),
    listAssignableUsers(),
    listServerOptions(user.id),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="New task" />
      <TaskForm
        mode="create"
        requester={{ name: user.name, email: user.email }}
        clients={clients}
        activityTypes={activityTypes}
        people={peopleOptions(people)}
        servers={servers}
      />
    </div>
  );
}
