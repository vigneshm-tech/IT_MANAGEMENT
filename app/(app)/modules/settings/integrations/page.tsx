import type { Metadata } from "next";
import { AccessDenied } from "@/components/modules/access-denied";
import { IntegrationForm } from "@/components/modules/integration-form";
import { SettingsTabs } from "@/components/modules/settings-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { canManageAction1 } from "@/lib/integrations/access";
import { CLIENT_FIELD_ID, CLIENT_PROJECT_ID } from "@/lib/integrations/redmine-clients";
import { integrationStatus } from "@/lib/integrations/store";

export const metadata: Metadata = { title: "Integrations" };

/** North America console; the field also accepts app.action1.com or .../api/3.0. */
const DEFAULT_ACTION1_ADDRESS = "https://app.na-2.action1.com";

/**
 * Two connections, and they are different kinds of thing.
 *
 * Redmine is per person — the portal shows the issues *you* are assigned, so the
 * key belongs to your profile. Action1 is per organisation: one credential, one
 * inventory, shared by everyone the servers module is visible to.
 */
export default async function IntegrationsSettingsPage() {
  const user = await requireUser();
  if (!canAccessModule(user.role, "settings")) {
    return <AccessDenied moduleTitle="Settings" />;
  }

  const [redmine, action1] = await Promise.all([
    integrationStatus(user.id, "redmine"),
    integrationStatus(user.id, "action1"),
  ]);
  const canManage = canManageAction1(user.role);

  return (
    <div className="space-y-5">
      <PageHeader title="Integrations">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
          <SettingsTabs active="integrations" />
        </div>
      </PageHeader>

      <section className="divide-y divide-line border-y border-line">
        <div className="grid gap-3 px-4 py-5 sm:px-5 lg:grid-cols-[240px_1fr]">
          <div>
            <p className="text-[13px] font-medium text-navy">Redmine</p>
            <p className="mt-0.5 text-[11.5px] text-muted">Assigned tickets in the portal</p>
          </div>
          <IntegrationForm
            provider="redmine"
            status={redmine}
            canManage
            needsUrl
            secretPlaceholder="Paste your Redmine API key"
            hint="Find the key under My account → API access in Redmine."
            extraFields={[
              {
                name: "projectId",
                label: "Portal project id",
                placeholder: String(CLIENT_PROJECT_ID),
                defaultValue: String(CLIENT_PROJECT_ID),
                hint: "The project whose tickets carry the client field.",
              },
              {
                name: "clientFieldId",
                label: "Client field id",
                placeholder: String(CLIENT_FIELD_ID),
                defaultValue: String(CLIENT_FIELD_ID),
                hint: "The custom field that holds the client.",
              },
            ]}
          />
        </div>

        <div className="grid gap-3 px-4 py-5 sm:px-5 lg:grid-cols-[240px_1fr]">
          <div>
            <p className="text-[13px] font-medium text-navy">Action1</p>
            <p className="mt-0.5 text-[11.5px] text-muted">Organisation server inventory</p>
          </div>
          <IntegrationForm
            provider="action1"
            status={action1}
            canManage={canManage}
            needsUrl
            urlRequired={false}
            urlLabel="API address"
            urlPlaceholder={DEFAULT_ACTION1_ADDRESS}
            secretLabel="Client secret"
            secretPlaceholder="Paste the client secret"
            extraFields={[
              {
                name: "clientId",
                label: "Client ID",
                placeholder: "Client ID from Action1",
                required: true,
              },
              {
                name: "orgId",
                label: "Organization ID",
                placeholder: "Optional — first organization",
                hint: "Blank uses the first organization.",
              },
            ]}
            hint="Create the API key in the Action1 console."
            managedBy="Managed by IT."
          />
        </div>
      </section>

    </div>
  );
}
