import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { TaskForm } from "@/components/modules/task-form";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listClients } from "@/lib/records/repository";
import { getTask } from "@/lib/tasks/repository";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Edit ${id}` };
}

export default async function EditTaskPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireUser();

  // Editing is leadership/IT only — everyone else goes back to the task.
  if (!can(user.role, "tasks", "edit")) redirect(`/modules/tasks/${id}`);

  const task = await getTask(id);
  if (!task) notFound();

  const clients = (await listClients())
    .filter((client) => client.status === "active")
    .map((client) => client.name);

  return (
    <div className="space-y-4">
      <PageHeader title="Edit task" />
      <TaskForm
        mode="edit"
        task={task}
        requester={{ name: user.name, email: user.email }}
        clients={clients}
      />
    </div>
  );
}
