import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CloudOff, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { TicketForm } from "@/components/modules/ticket-form";
import { AccessDenied } from "@/components/modules/access-denied";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { loadTicketProjects } from "@/lib/tickets/portal";

export const metadata: Metadata = { title: "New ticket" };

export default async function NewTicketPage() {
  const user = await requireUser();

  if (!canAccessModule(user.role, "tickets")) {
    return <AccessDenied moduleTitle="Ticket Portal" />;
  }

  const projects = await loadTicketProjects(user.id);
  const canCreate = can(user.role, "tickets", "create");

  return (
    <div className="space-y-4">
      <PageHeader
        title="New ticket"
        actions={
          <Link href="/modules/tickets" className={buttonClass({ variant: "secondary", size: "sm" })}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Ticket Portal
          </Link>
        }
      >
        <p className="text-[12.5px] text-muted">
          The ticket is created in Redmine.
        </p>
      </PageHeader>

      {!canCreate ? (
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          Read only — you cannot raise tickets.
        </p>
      ) : projects.state === "disconnected" ? (
        <div className="flex items-start gap-3 border border-line bg-surface px-4 py-4">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          <div>
            <p className="text-[13px] font-medium text-navy">Redmine is not connected</p>
            <p className="mt-1 text-[12.5px] text-muted">
              Connect Redmine in Settings → Integrations.
            </p>
            <Link
              href="/modules/settings/integrations"
              className={buttonClass({ variant: "primary", size: "sm", className: "mt-3" })}
            >
              Open Settings
            </Link>
          </div>
        </div>
      ) : projects.state === "error" ? (
        <div className="flex items-start gap-3 border border-[#eccfcd] bg-danger-soft px-4 py-3">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-danger">
            <span className="font-medium">Projects could not be loaded.</span> {projects.error}
          </p>
        </div>
      ) : projects.projects.length === 0 ? (
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          This Redmine account cannot see any projects.
        </p>
      ) : (
        <TicketForm projects={projects.projects} />
      )}
    </div>
  );
}
