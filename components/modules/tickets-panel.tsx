import {
  ArrowRight,
  CheckCircle2,
  Inbox,
  KeyRound,
  RefreshCw,
  Ticket,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import type { IntegrationStatus } from "@/lib/integrations/store";

export function TicketsPanel({ status }: { status: IntegrationStatus }) {
  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        {[
          { label: "Assigned to you", value: "—", icon: UserCheck },
          { label: "Open", value: "—", icon: Inbox },
          { label: "Closed this week", value: "—", icon: CheckCircle2 },
          { label: "Last sync", value: "Never", icon: RefreshCw },
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

      {status.connected ? (
        <div className="rounded-2xl border border-line/70 bg-surface/50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-success/25 bg-success/10 text-success">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <p className="text-[13px] font-medium text-ink">Redmine connected</p>
                <p className="text-[11.5px] text-muted">{status.baseUrl}</p>
              </div>
            </div>
            <span className="rounded-lg border border-line bg-surface-2/70 px-2.5 py-1.5 font-mono text-[11px] text-muted">
              {status.masked}
            </span>
          </div>

          <div className="mt-5 rounded-xl border border-dashed border-line bg-base/40 p-8 text-center">
            <Ticket className="mx-auto h-7 w-7 text-muted/60" aria-hidden />
            <p className="mt-2 text-[13px] font-medium text-ink">No tickets synced yet</p>
            <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-muted">
              The Redmine sync lands in milestone 2. Your key is stored safely; the portal will pull
              your assigned issues and expose read + close actions here.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-line/70 bg-surface/50 p-6 sm:p-8">
          <div className="mx-auto max-w-lg text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-brand/25 bg-brand/10 text-brand-soft">
              <KeyRound className="h-6 w-6" aria-hidden />
            </span>
            <h3 className="mt-4 text-[17px] font-semibold text-ink">Connect your Redmine key</h3>
            <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted">
              The Ticket Portal uses your personal API key to show the tickets assigned to you, let
              you read them and close them with a resolution. Nothing is shared between employees.
            </p>

            <ol className="mt-5 space-y-2 text-left">
              {[
                "Open Redmine → My account → API access key.",
                "Paste the key in Settings → Integration keys.",
                "Come back here to see your assigned queue.",
              ].map((step, index) => (
                <li
                  key={step}
                  className="flex items-start gap-2.5 rounded-xl border border-line/70 bg-surface-2/40 px-3.5 py-2.5 text-[12px] text-muted"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/20 text-[10.5px] font-semibold text-brand-soft">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>

            <Link
              href="/modules/settings"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-[#5b8cff] px-4 py-2.5 text-[12.5px] font-semibold text-white transition hover:brightness-110"
            >
              Add your API key
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
