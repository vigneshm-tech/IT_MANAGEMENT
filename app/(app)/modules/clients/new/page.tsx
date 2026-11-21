import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { AccessDenied } from "@/components/modules/access-denied";
import { ClientForm } from "@/components/modules/client-form";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import {
  listActiveIndustries,
  listAssignableUsers,
  listModuleCustomFields,
} from "@/lib/records/repository";
import { createClientAction } from "@/app/(app)/modules/clients/actions";

export const metadata: Metadata = { title: "New client" };

export default async function NewClientPage() {
  const user = await requireUser();

  if (!canAccessModule(user.role, "clients")) {
    return <AccessDenied moduleTitle="Clients" />;
  }

  if (!can(user.role, "clients", "edit")) {
    return (
      <div className="space-y-4">
        <PageHeader title="New client" />
        <div className="flex items-start gap-3 border border-line bg-surface px-4 py-4">
          <p className="text-[12.5px] text-muted">
            Your role can read the client register but not add to it.
          </p>
        </div>
        <Link href="/modules/clients" className={buttonClass({ variant: "secondary", size: "sm" })}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Clients
        </Link>
      </div>
    );
  }

  const [people, industries, customFields] = await Promise.all([
    listAssignableUsers(),
    listActiveIndustries(),
    listModuleCustomFields("clients"),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="New client"
        actions={
          <Link
            href="/modules/clients"
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Clients
          </Link>
        }
      >
        <p className="text-[12.5px] leading-relaxed text-muted">
          One account, two contacts and the people who own it. Required fields are marked, and the
          created / last-updated dates are captured automatically.
        </p>
      </PageHeader>

      <ClientForm
        people={people}
        industries={industries}
        customFields={customFields}
        action={createClientAction}
      />
    </div>
  );
}
