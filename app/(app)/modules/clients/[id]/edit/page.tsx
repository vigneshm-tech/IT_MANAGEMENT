import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { AccessDenied } from "@/components/modules/access-denied";
import { ClientForm } from "@/components/modules/client-form";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { clientTimestamps } from "@/lib/clients";
import {
  listActiveIndustries,
  listAssignableUsers,
  listClients,
  listCustomFieldValues,
  listModuleCustomFields,
} from "@/lib/records/repository";
import { updateClientAction } from "@/app/(app)/modules/clients/actions";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Edit ${id}` };
}

export default async function EditClientPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireUser();

  if (!canAccessModule(user.role, "clients")) {
    return <AccessDenied moduleTitle="Clients" />;
  }

  const client = (await listClients()).find((item) => item.id === id);

  if (!client) {
    return (
      <div className="space-y-4">
        <PageHeader title="Client" />
        <div className="flex items-start gap-3 border border-line bg-surface px-4 py-4">
          <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          <div>
            <p className="text-[13px] font-medium text-navy">That client is not in the register</p>
            <p className="mt-1 text-[12.5px] text-muted">
              It may have been removed in another tab.
            </p>
            <Link
              href="/modules/clients"
              className={buttonClass({ variant: "secondary", size: "sm", className: "mt-3" })}
            >
              Back to clients
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!can(user.role, "clients", "edit")) {
    return (
      <div className="space-y-4">
        <PageHeader title={client.name} />
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          Read only — you cannot change clients.
        </p>
        <Link href="/modules/clients" className={buttonClass({ variant: "secondary", size: "sm" })}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Clients
        </Link>
      </div>
    );
  }

  const [people, industries, customFields, customValues] = await Promise.all([
    listAssignableUsers(),
    listActiveIndustries(),
    listModuleCustomFields("clients"),
    listCustomFieldValues(client.id),
  ]);
  const stamps = clientTimestamps(client.createdAt, client.updatedAt);

  return (
    <div className="space-y-4">
      <PageHeader
        title={client.name}
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
        <p className="text-[12px] text-muted">
          Created {stamps.created} · updated {stamps.touched ? stamps.updated : "never"}
        </p>
      </PageHeader>

      <ClientForm
        people={people}
        industries={industries}
        customFields={customFields}
        customValues={customValues}
        client={client}
        action={updateClientAction}
        submitLabel="Save changes"
      />
    </div>
  );
}
