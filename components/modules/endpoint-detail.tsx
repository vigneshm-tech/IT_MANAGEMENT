import Link from "next/link";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Action1Endpoint } from "@/lib/integrations/action1";
import { describeLastSeen, describePatchHeadline, rebootLabel } from "@/lib/servers/endpoint";
import { refreshServersAction } from "@/app/(app)/modules/servers/actions";

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">{label}</dt>
      <dd className={`mt-1 text-[12.5px] text-body ${mono ? "font-mono text-[11.5px]" : ""}`}>
        {value || "—"}
      </dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `endpoint-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-[13px] font-semibold text-navy">
        {title}
      </h2>
      <dl className="mt-3 grid grid-cols-1 gap-x-10 gap-y-4 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </dl>
    </section>
  );
}

/** Everything Action1 knows about one managed endpoint. */
export function EndpointDetail({
  endpoint,
  organizationId,
}: {
  endpoint: Action1Endpoint;
  organizationId: string;
}) {
  const reboot = rebootLabel(endpoint);
  const rebootRequired = reboot === "Required";
  const patchHeadline = describePatchHeadline(endpoint);

  return (
    <div className="space-y-7">
      <PageHeader
        title={endpoint.name}
        actions={
          <>
            <form action={refreshServersAction}>
              <button type="submit" className={buttonClass({ variant: "secondary", size: "sm" })}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Refresh
              </button>
            </form>
            <a
              href={endpoint.url}
              target="_blank"
              rel="noreferrer"
              className={buttonClass({ size: "sm" })}
            >
              Open in Action1
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
            <Link href="/modules/servers" className={buttonClass({ variant: "ghost", size: "sm" })}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Servers
            </Link>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <StatusPill status={endpoint.status} />
          <span className="text-[12.5px] text-muted">
            Last seen {describeLastSeen(endpoint.lastSeen).toLowerCase()}
            {endpoint.lastSeen ? ` · ${formatDateTime(endpoint.lastSeen)} IST` : ""}
          </span>
          <span className="text-[12.5px] text-muted">{patchHeadline}</span>
          <span
            className={rebootRequired ? "text-[12.5px] font-medium text-danger" : "text-[12.5px] text-muted"}
          >
            Reboot {reboot.toLowerCase()}
          </span>
        </div>
      </PageHeader>

      <Section title="Identity">
        <Field label="Endpoint ID" value={endpoint.id} mono />
        <Field label="Operating system" value={endpoint.os} />
        <Field label="Platform" value={endpoint.platform} />
        <Field label="Manufacturer" value={endpoint.manufacturer} />
        <Field label="Model" value={endpoint.model} />
        <Field label="Serial number" value={endpoint.serial} mono />
        <Field label="Assigned user" value={endpoint.user} />
        <Field label="Comment" value={endpoint.comment} />
        <Field label="Subscription" value={endpoint.subscriptionStatus || endpoint.status} />
      </Section>

      <Section title="Network">
        <Field label="IP address" value={endpoint.ipAddress} mono />
        <Field label="External address" value={endpoint.externalAddress} mono />
        <Field label="MAC address" value={endpoint.mac} mono />
      </Section>

      <Section title="Agent">
        <Field label="Agent version" value={endpoint.agentVersion} mono />
        <Field
          label="Agent installed"
          value={endpoint.agentInstallDate ? formatDate(endpoint.agentInstallDate) : ""}
        />
        <Field
          label="Last check-in"
          value={endpoint.lastSeen ? `${formatDateTime(endpoint.lastSeen)} IST` : ""}
        />
        <Field
          label="Last boot"
          value={endpoint.lastBootTime ? formatDateTime(endpoint.lastBootTime) : ""}
        />
        <Field label="Organization" value={organizationId} mono />
      </Section>

      <Section title="Patching">
        <Field
          label="Missing critical updates"
          value={endpoint.missingCritical === null ? "" : String(endpoint.missingCritical)}
        />
        <Field
          label="Missing other updates"
          value={endpoint.missingOther === null ? "" : String(endpoint.missingOther)}
        />
        <Field label="Update status" value={endpoint.updateStatus} />
        <Field label="Reboot required" value={reboot} />
        <Field label="Vulnerability status" value={endpoint.vulnerabilityStatus} />
      </Section>

      <Section title="Hardware">
        <Field label="CPU" value={endpoint.cpu} />
        <Field label="RAM" value={endpoint.ram} />
        <Field label="Disk" value={endpoint.disk} />
      </Section>
    </div>
  );
}
