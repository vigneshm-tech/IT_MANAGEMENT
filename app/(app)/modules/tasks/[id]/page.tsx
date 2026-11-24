import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PencilLine } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill, humanise } from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { TaskNotesPanel, TaskStatusPanel } from "@/components/modules/task-panels";
import { AccessDenied } from "@/components/modules/access-denied";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { roleOf } from "@/lib/roles";
import { getTask } from "@/lib/tasks/repository";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; updated?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const task = await getTask(id);
  return { title: task?.title ?? "Task" };
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{label}</dt>
      <dd className="mt-1 text-[12.5px] text-navy">{children}</dd>
    </div>
  );
}

export default async function TaskPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const user = await requireUser();

  if (!can(user.role, "tasks", "view")) {
    return <AccessDenied moduleTitle="Task Management" />;
  }

  const task = await getTask(id);
  if (!task) notFound();

  const { created, updated } = await searchParams;
  const canEdit = can(user.role, "tasks", "edit");
  const canMove =
    canEdit || task.assigneeRole === user.role || task.assigneeId === user.id;

  return (
    <div className="space-y-4">
      <PageHeader
        title={task.title}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/modules/tasks"
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Board
            </Link>
            {canEdit && (
              <Link
                href={`/modules/tasks/${task.id}/edit`}
                className={buttonClass({ variant: "primary", size: "sm" })}
              >
                <PencilLine className="h-3.5 w-3.5" aria-hidden />
                Edit task
              </Link>
            )}
          </div>
        }
      />

      {(created || updated) && (
        <p className="border border-[#cfe4d4] bg-success-soft px-4 py-2.5 text-[12.5px] text-success">
          {created ? `${task.id} was created and assigned.` : `${task.id} was updated.`}
        </p>
      )}

      <section className="border border-line bg-surface">
        <div className="grid grid-cols-2 gap-x-5 gap-y-4 border-b border-line px-4 py-4 sm:grid-cols-3 sm:px-5">
          <Detail label="Task ID">
            <span className="font-mono text-[12px]">{task.id}</span>
          </Detail>
          <Detail label="Status">
            <StatusPill status={task.status} label={humanise(task.status)} />
          </Detail>
          <Detail label="Priority">
            <StatusPill status={task.priority} label={humanise(task.priority)} />
          </Detail>
          <Detail label="Client">{task.clientName || "—"}</Detail>
          <Detail label="Activity type">{task.activityType || "—"}</Detail>
          <Detail label="Planned">{humanise(task.planStatus)}</Detail>
          <Detail label="Assigned to">
            {task.assigneeName || roleOf(task.assigneeRole).label}
          </Detail>
          <Detail label="Due">{task.dueDate ? formatDate(task.dueDate) : "—"}</Detail>
          <Detail label="Reference ticket">{task.referenceTicketNo || "—"}</Detail>
          <Detail label="Requested by">{task.requestedByName || task.createdByName}</Detail>
          <Detail label="Requester email">{task.requestedByEmail || "—"}</Detail>
          <Detail label="Raised">{formatDateTime(task.createdAt)}</Detail>
        </div>

        <div className="grid grid-cols-1 gap-5 px-4 py-4 sm:px-5 lg:grid-cols-2">
          <div>
            <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Description
            </h2>
            <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-body">
              {task.description || "No description was added."}
            </p>
          </div>
          <div>
            <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Server details
            </h2>
            <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-body">
              {task.serverDetails || "No server details were added."}
            </p>
          </div>
          <div className="lg:col-span-2">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Communication
            </h2>
            <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-body">
              {task.communication || "No communication was recorded."}
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TaskStatusPanel taskId={task.id} current={task.status} canMove={canMove} />
        <TaskNotesPanel taskId={task.id} notes={task.notes} canNote={canMove} />
      </div>
    </div>
  );
}
