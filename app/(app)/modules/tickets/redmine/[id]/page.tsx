import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CloudOff, ExternalLink, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { StatusPill, humanise } from "@/components/ui/status-pill";
import { AccessDenied } from "@/components/modules/access-denied";
import { TicketUpdateForm } from "@/components/modules/ticket-update-form";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { loadTicketEditor } from "@/lib/tickets/portal";
import { formatDateTime } from "@/lib/format";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ updated?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Ticket #${id}` };
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">{label}</dt>
      <dd className="mt-1 text-[12.5px] text-navy">{children}</dd>
    </div>
  );
}

export default async function TicketPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const user = await requireUser();

  if (!canAccessModule(user.role, "tickets")) {
    return <AccessDenied moduleTitle="Ticket Portal" />;
  }

  const data = await loadTicketEditor(user.id, id);
  const { updated } = await searchParams;
  const canEdit = can(user.role, "tickets", "edit");

  if (data.state === "disconnected") {
    return (
      <div className="space-y-4">
        <PageHeader title="Ticket" />
        <div className="flex items-start gap-3 border border-line bg-surface px-4 py-4">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          <div>
            <p className="text-[13px] font-medium text-navy">Redmine is not connected</p>
            <p className="mt-1 text-[12.5px] text-muted">
              Save your instance URL and API key to open tickets here.
            </p>
            <Link
              href="/modules/settings/integrations"
              className={buttonClass({ variant: "primary", size: "sm", className: "mt-3" })}
            >
              Open Settings
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (data.state === "error") {
    return (
      <div className="space-y-4">
        <PageHeader title={`Ticket #${id}`} />
        <div className="flex items-start gap-3 border border-[#eccfcd] bg-danger-soft px-4 py-3">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-danger">
            <span className="font-medium">That ticket could not be read.</span> {data.error}
          </p>
        </div>
        <Link href="/modules/tickets" className={buttonClass({ variant: "secondary", size: "sm" })}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to the portal
        </Link>
      </div>
    );
  }

  const { issue, statuses, priorities, members, baseUrl } = data;

  return (
    <div className="space-y-4">
      <PageHeader
        title={issue.subject}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/modules/tickets"
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Portal
            </Link>
            <a
              href={issue.url}
              target="_blank"
              rel="noreferrer"
              className={buttonClass({ variant: "primary", size: "sm" })}
            >
              Open in Redmine
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
        }
      >
        <p className="text-[12px] text-muted">
          #{issue.id} · {issue.project.name} · {issue.tracker.name}
        </p>
      </PageHeader>

      {updated && (
        <p className="border border-[#cfe4d4] bg-success-soft px-4 py-2.5 text-[12.5px] text-success">
          Ticket #{issue.id} was updated in Redmine.
        </p>
      )}

      <section className="border border-line bg-surface">
        <div className="grid grid-cols-2 gap-x-5 gap-y-4 border-b border-line px-4 py-4 sm:grid-cols-3 sm:px-5">
          <Detail label="Status">
            <StatusPill status={issue.status.name} label={humanise(issue.status.name)} />
          </Detail>
          <Detail label="Priority">{issue.priority.name}</Detail>
          <Detail label="Assignee">{issue.assignee?.name ?? "Unassigned"}</Detail>
          <Detail label="Author">{issue.author.name || "—"}</Detail>
          <Detail label="Due date">{issue.dueDate ?? "—"}</Detail>
          <Detail label="Updated">{issue.updatedOn ? formatDateTime(issue.updatedOn) : "—"}</Detail>
        </div>

        <div className="px-4 py-4 sm:px-5">
          <h2 className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
            Description
          </h2>
          <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-body">
            {issue.description || "No description was added."}
          </p>
        </div>
      </section>

      <section className="border border-line bg-surface">
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-navy">
            Activity
          </h2>
          <p className="mt-1 text-[11.5px] text-muted">
            Journal entries as Redmine stores them, newest at the bottom.
          </p>
        </div>

        <div className="px-4 py-4 sm:px-5">
          {issue.journals.length === 0 ? (
            <p className="text-[12.5px] text-muted">No comments yet.</p>
          ) : (
            <ul className="space-y-4">
              {issue.journals.map((journal) => (
                <li key={journal.id} className="border-l-2 border-line pl-3">
                  <p className="text-[11px] text-muted">
                    {journal.user.name || "Someone"} · {formatDateTime(journal.createdOn)}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-body">
                    {journal.notes}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {canEdit ? (
        <TicketUpdateForm
          issue={{
            id: issue.id,
            subject: issue.subject,
            description: issue.description,
            statusId: issue.statusId,
            priorityId: issue.priorityId,
            assigneeId: issue.assigneeId,
          }}
          statuses={statuses}
          priorities={priorities}
          members={members}
          baseUrl={baseUrl}
        />
      ) : (
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          Your role can read tickets but not change them.
        </p>
      )}
    </div>
  );
}
