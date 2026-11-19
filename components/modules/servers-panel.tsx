import {
  ArrowRight,
  CheckCircle2,
  Cpu,
  HardDrive,
  Server,
  ShieldAlert,
  Wifi,
} from "lucide-react";
import Link from "next/link";
import type { IntegrationStatus } from "@/lib/integrations/store";
import type { RoleId } from "@/lib/roles";

export function ServersPanel({
  status,
  role,
}: {
  status: IntegrationStatus;
  role: RoleId;
}) {
  const canConfigure = role === "it_manager" || role === "it_engineer";

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        {[
          { label: "Managed endpoints", value: "—", icon: HardDrive },
          { label: "Healthy", value: "—", icon: CheckCircle2 },
          { label: "Patch pending", value: "—", icon: ShieldAlert },
          { label: "Offline &gt; 7d", value: "—", icon: Wifi },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-line/70 bg-surface/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">
                {stat.label}
              </span>
              <stat.icon className="h-3.5 w-3.5 text-muted" aria-hidden />
            </div>
            <p className="mt-2 text-[19px] font-semibold text-ink">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-line/70 bg-surface/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-base/60 text-brand-soft">
              <Cpu className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-[13px] font-medium text-ink">Action1 integration</p>
              <p className="text-[11.5px] text-muted">
                {status.connected
                  ? `Key ${status.masked} saved by IT`
                  : "No API key configured yet"}
              </p>
            </div>
          </div>
          <span
            className={
              status.connected
                ? "rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-success"
                : "rounded-full border border-warning/25 bg-warning/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-warning"
            }
          >
            {status.connected ? "Connected" : "Awaiting IT"}
          </span>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-line/70">
          <table className="w-full text-left">
            <thead className="bg-surface-2/60 text-[10px] uppercase tracking-[0.1em] text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Endpoint</th>
                <th className="px-3 py-2 font-medium">OS</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">Patch status</th>
                <th className="px-3 py-2 text-right font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2].map((row) => (
                <tr key={row} className="border-t border-line/60 bg-base/30">
                  <td className="px-3 py-2.5">
                    <div className="h-2.5 w-28 rounded bg-surface-3/80" />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="h-2.5 w-16 rounded bg-surface-3/60" />
                  </td>
                  <td className="hidden px-3 py-2.5 sm:table-cell">
                    <div className="h-2.5 w-20 rounded bg-surface-3/60" />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="ml-auto h-2.5 w-14 rounded bg-surface-3/60" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {status.connected ? (
          <p className="mt-3 text-[11.5px] text-muted">
            Endpoint sync arrives in milestone 2. The key is in place, so the inventory will populate
            as soon as the sync job is enabled.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/20 bg-warning/[0.06] px-3.5 py-3">
            <p className="max-w-md text-[12px] leading-relaxed text-warning/90">
              {canConfigure
                ? "Configure the Action1 API key in Settings to pull the server inventory."
                : "Only IT configures the Action1 key. Once it is saved, this inventory fills automatically."}
            </p>
            {canConfigure ? (
              <Link
                href="/modules/settings"
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand/35 bg-brand/10 px-3 py-2 text-[11.5px] font-medium text-brand-soft transition hover:bg-brand/20"
              >
                Configure Action1
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2/70 px-3 py-2 text-[11.5px] text-muted">
                <Server className="h-3.5 w-3.5" aria-hidden />
                Managed by IT
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
