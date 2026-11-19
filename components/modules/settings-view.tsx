import { LogOut, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { IntegrationForm } from "./integration-form";
import type { IntegrationStatus } from "@/lib/integrations/store";
import type { SessionUser } from "@/lib/auth/token";
import { ROLE_BY_ID } from "@/lib/roles";
import { logoutAction } from "@/lib/auth/actions";
import { formatDateTime } from "@/lib/format";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-[13px] text-body">{value}</dd>
    </div>
  );
}

export function SettingsView({
  user,
  redmine,
  action1,
  canManageAction1,
}: {
  user: SessionUser;
  redmine: IntegrationStatus;
  action1: IntegrationStatus;
  canManageAction1: boolean;
}) {
  const role = ROLE_BY_ID[user.role];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        meta={<span className="text-[12.5px] text-muted">{role.label}</span>}
      />

      <section aria-labelledby="profile-heading">
        <h2 id="profile-heading" className="text-[14px] font-semibold text-navy">
          Profile
        </h2>
        <p className="mt-0.5 text-[12px] text-muted">
          Managed by your organisation’s directory.
        </p>
        <dl className="mt-4 grid grid-cols-1 gap-x-10 gap-y-5 border-y border-line py-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Name" value={user.name} />
          <Field label="Email" value={user.email} />
          <Field label="Job title" value={user.title} />
          <Field label="Access level" value={role.label} />
        </dl>
      </section>

      <section aria-labelledby="connections-heading">
        <h2 id="connections-heading" className="text-[14px] font-semibold text-navy">
          Connections
        </h2>
        <p className="mt-0.5 text-[12px] text-muted">
          Keys are scoped to your profile and masked once saved.
        </p>

        <div className="mt-2 divide-y divide-line border-t border-line">
          <div className="grid gap-3 py-5 lg:grid-cols-[240px_1fr]">
            <div>
              <p className="text-[13px] font-medium text-navy">Redmine</p>
              <p className="mt-0.5 text-[11.5px] text-muted">
                Assigned tickets in the portal
              </p>
            </div>
            <IntegrationForm
              provider="redmine"
              status={redmine}
              canManage
              needsUrl
              secretPlaceholder="Paste your Redmine API key"
              hint="Find the key under My account → API access in Redmine."
            />
          </div>

          <div className="grid gap-3 py-5 lg:grid-cols-[240px_1fr]">
            <div>
              <p className="text-[13px] font-medium text-navy">Action1</p>
              <p className="mt-0.5 text-[11.5px] text-muted">Organisation server inventory</p>
            </div>
            <IntegrationForm
              provider="action1"
              status={action1}
              canManage={canManageAction1}
              needsUrl={false}
              secretPlaceholder="Paste the Action1 API key"
              hint="Only IT can configure the organisation-wide Action1 key."
              managedBy="IT manages the Action1 key for the organisation."
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="session-heading">
        <h2 id="session-heading" className="text-[14px] font-semibold text-navy">
          Session
        </h2>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-y border-line py-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-navy-soft" aria-hidden />
            <div>
              <p className="text-[12.5px] text-body">
                Signed in with{" "}
                <span className="font-medium text-navy">
                  {user.provider === "supabase" ? "Supabase" : "demo directory"}
                </span>
              </p>
              <p className="mt-0.5 text-[11.5px] text-muted">
                Expires {formatDateTime(new Date(user.expiresAt * 1000))}
              </p>
            </div>
          </div>
          <form action={logoutAction}>
            <Button type="submit" variant="secondary" size="sm">
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              Sign out
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
