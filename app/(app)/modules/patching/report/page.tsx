import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, FileText } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { listPatchSchedules } from "@/lib/records/repository";
import { loadPatchLists } from "@/lib/servers/inventory";
import {
  PATCH_ENDPOINTS_MAX,
  PATCH_OUTCOME_LABEL,
  PATCH_OUTCOME_TONE,
  PATCH_STATUS_LABEL,
  approvedByName,
  formatPlannedDate,
  planStatus,
  verificationNames,
} from "@/lib/patching/plan";
import { PrintReportButton } from "./print-button";

export const metadata: Metadata = { title: "Patching report" };

type PageProps = { searchParams: Promise<{ plans?: string }> };

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">{label}</dt>
      <dd className="mt-0.5 text-[12.5px] text-navy">{value}</dd>
    </div>
  );
}

export default async function PatchReportPage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (!canAccessModule(user.role, "patching")) {
    return <AccessDenied moduleTitle="Patching Plans" />;
  }

  const { plans: raw } = await searchParams;
  const ids = String(raw ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, PATCH_ENDPOINTS_MAX);

  const all = await listPatchSchedules();
  const chosen = ids
    .map((id) => all.find((plan) => plan.id === id))
    .filter((plan): plan is (typeof all)[number] => Boolean(plan));

  const back = (
    <Link
      href="/modules/patching"
      className={buttonClass({ variant: "ghost", size: "sm" })}
      data-print="hide"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      Patching Plans
    </Link>
  );

  if (chosen.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-[18px] font-semibold tracking-[-0.01em] text-navy">Patching report</h1>
          {back}
        </div>
        <EmptyState
          icon={FileText}
          title="Nothing selected"
          description="Tick the endpoints that already have a plan on Patching Plans, then choose Prepare report."
          action={
            <Link href="/modules/patching" className={buttonClass({ size: "sm" })}>
              Open Patching Plans
            </Link>
          }
        />
      </div>
    );
  }

  const endpointIds = chosen.map((plan) => plan.endpointId).filter(Boolean);
  const patchLists = await loadPatchLists(user.id, endpointIds);
  const prepared = formatDate(new Date().toISOString());
  const totalPatches = chosen.reduce((sum, plan) => sum + plan.missingCount, 0);
  const outcomeCounts = {
    success: chosen.filter((plan) => plan.outcome === "success").length,
    partial: chosen.filter((plan) => plan.outcome === "partial").length,
    failed: chosen.filter((plan) => plan.outcome === "failed").length,
    pending: chosen.filter((plan) => plan.outcome === "pending").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2" data-print="hide">
        {back}
        <PrintReportButton />
      </div>

      <article className="print-sheet border border-line bg-surface px-6 py-6 sm:px-8">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
          <Image
            src="/brand/wordmark.svg"
            alt="TaskTornado"
            width={186}
            height={20}
            priority
            unoptimized
          />
          <div className="text-right">
            <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-navy">
              Patching report
            </h1>
            <p className="text-[11.5px] text-muted">
              Prepared {prepared} · {chosen.length}{" "}
              {chosen.length === 1 ? "endpoint" : "endpoints"} · {totalPatches} missing{" "}
              {totalPatches === 1 ? "patch" : "patches"}
            </p>
            <p className="text-[11.5px] text-muted">
              {outcomeCounts.success} success · {outcomeCounts.partial} partial ·{" "}
              {outcomeCounts.failed} failed · {outcomeCounts.pending} not run
            </p>
          </div>
        </header>

        <div className="mt-5 space-y-7">
          {chosen.map((plan, index) => {
            const status = planStatus(plan.approvers);
            const list = patchLists.kind === "ready" ? patchLists.lists[plan.endpointId] : undefined;

            return (
              <section key={plan.id} className="print-block">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-1.5">
                  <h2 className="text-[13.5px] font-semibold text-navy">
                    {index + 1}. {plan.endpointName}
                  </h2>
                  <StatusPill status={status} label={PATCH_STATUS_LABEL[status]} />
                </div>

                <dl className="mt-2.5 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-5">
                  <Field label="Planned date" value={formatPlannedDate(plan.plannedDate)} />
                  <Field label="IT member handling" value={plan.handlerName || "—"} />
                  <Field label="Approved provided by" value={approvedByName(plan.approvers)} />
                  <Field label="Verified by" value={verificationNames(plan.approvers)} />
                  <div>
                    <dt className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">
                      Update status
                    </dt>
                    <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-navy">
                      <StatusPill
                        status={plan.outcome}
                        tone={PATCH_OUTCOME_TONE[plan.outcome]}
                        label={PATCH_OUTCOME_LABEL[plan.outcome]}
                      />
                      {plan.outcomeByName ? (
                        <span className="text-[11px] text-muted">{plan.outcomeByName}</span>
                      ) : null}
                    </dd>
                  </div>
                </dl>

                <p className="mt-2 text-[11.5px] text-muted">
                  {plan.missingCount} missing {plan.missingCount === 1 ? "patch" : "patches"} ·{" "}
                  {plan.otherCount} other {plan.otherCount === 1 ? "update" : "updates"}
                  {plan.note ? ` · ${plan.note}` : ""}
                </p>

                {patchLists.kind !== "ready" ? (
                  <p className="mt-3 border border-[#f0dfb4] bg-warning-soft px-2.5 py-1.5 text-[11.5px] text-warning">
                    Action1 is not reachable, so this endpoint&apos;s patch list cannot be printed.
                  </p>
                ) : list?.error ? (
                  <p className="mt-3 border border-[#f0dfb4] bg-warning-soft px-2.5 py-1.5 text-[11.5px] text-warning">
                    Patch list unavailable — {list.error}
                  </p>
                ) : !list || list.updates.length === 0 ? (
                  <p className="mt-3 text-[11.5px] text-muted">
                    Action1 reports no missing updates for this endpoint.
                  </p>
                ) : (
                  <table className="mt-3 w-full border-collapse text-[11.5px]">
                    <thead>
                      <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-[0.08em] text-muted">
                        <th className="w-12 py-1.5 pr-2 font-medium">S.No</th>
                        <th className="py-1.5 pr-2 font-medium">Patch name</th>
                        <th className="w-32 py-1.5 pr-2 font-medium">CVE</th>
                        <th className="w-24 py-1.5 font-medium">Severity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.updates.map((update, row) => (
                        <tr key={`${update.id}-${row}`} className="border-b border-line/70">
                          <td className="py-1.5 pr-2 text-muted">{row + 1}</td>
                          <td className="py-1.5 pr-2 text-navy">
                            {update.name}
                            {update.kb ? <span className="text-muted"> · {update.kb}</span> : null}
                          </td>
                          <td className="py-1.5 pr-2 font-mono text-[11px] text-body">
                            {update.cve || "—"}
                          </td>
                          <td className="py-1.5">
                            {update.severity ? (
                              <StatusPill
                                status={update.severity}
                                label={update.severity}
                                tone={
                                  update.severity.toLowerCase() === "critical"
                                    ? "danger"
                                    : update.severity.toLowerCase() === "important"
                                      ? "pending"
                                      : "neutral"
                                }
                              />
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            );
          })}
        </div>

        <footer className="mt-6 border-t border-line pt-2.5 text-[10.5px] text-muted">
          Patch data as Action1 reports it on {prepared}. TaskTornado · Developed by Infeara
          Technologies.
        </footer>
      </article>
    </div>
  );
}
