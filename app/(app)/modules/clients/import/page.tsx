import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { AccessDenied } from "@/components/modules/access-denied";
import { ClientImportForm } from "@/components/modules/client-import-form";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Import clients" };

export default async function ImportClientsPage() {
  const user = await requireUser();

  if (!canAccessModule(user.role, "clients")) {
    return <AccessDenied moduleTitle="Clients" />;
  }

  if (!can(user.role, "clients", "edit")) {
    return (
      <div className="space-y-4">
        <PageHeader title="Import clients" />
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          Your role can read the client register but not add to it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Import clients"
        actions={
          <Link
            href="/modules/clients"
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Clients
          </Link>
        }
      />

      <ClientImportForm />
    </div>
  );
}
