import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Folder,
  FolderOpen,
  Lock,
  PencilLine,
  Power,
  RefreshCw,
  Trash2,
  Unplug,
} from "lucide-react";
import type { IisApplication } from "@/lib/iis/constants";

/**
 * The register, as ten columns of facts.
 *
 * The three switch-like columns — SSL, directory browsing, state — are icons,
 * not sentences: a column of "Mapped / Not mapped / Enabled / Disabled" is a
 * column of words that all look alike at a glance. The icon carries the state
 * and the tooltip carries the detail (which certificate, which expiry), so the
 * table stays scannable without losing the reason anybody looks.
 */

const CELL = "px-3 py-2.5";
const MONO = "font-mono text-[11.5px] text-body";

const ICON_BUTTON =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-line text-body transition-colors hover:border-navy hover:text-navy";
const ICON_BUTTON_DANGER =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#f0d5d5] text-danger transition-colors hover:border-danger hover:bg-danger-soft";

/** Days from today to the certificate's expiry, in whole days. */
function daysTo(date: string | null): number | null {
  if (!date) return null;
  return Math.floor((new Date(`${date}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);
}

function SslIcon({ row }: { row: IisApplication }) {
  if (!row.sslMapped) {
    return (
      <span title="No HTTPS binding" aria-label="SSL not mapped">
        <Unplug className="h-4 w-4 text-muted" aria-hidden />
      </span>
    );
  }

  const days = daysTo(row.sslExpiresAt);
  const colour =
    days === null ? "text-navy" : days < 0 ? "text-danger" : days <= 30 ? "text-[#8a5a1c]" : "text-navy";

  const label = [
    row.sslCertificate || "certificate name not reported",
    row.sslExpiresAt ? `to ${row.sslExpiresAt}` : "",
    days !== null && days < 0 ? "(expired)" : days !== null && days <= 30 ? `(${days} days)` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span title={`SSL mapped · ${label}`} aria-label={`SSL mapped: ${label}`}>
      <Lock className={`h-4 w-4 ${colour}`} aria-hidden />
    </span>
  );
}

function BrowsingIcon({ row }: { row: IisApplication }) {
  const enabled = row.directoryBrowsing === "enabled";
  return (
    <span
      title={enabled ? "Directory browsing enabled" : "Directory browsing disabled"}
      aria-label={enabled ? "Directory browsing enabled" : "Directory browsing disabled"}
    >
      {enabled ? (
        <FolderOpen className="h-4 w-4 text-[#8a5a1c]" aria-hidden />
      ) : (
        <Folder className="h-4 w-4 text-muted" aria-hidden />
      )}
    </span>
  );
}

const STATE_ICON = {
  running: { Icon: CheckCircle2, tone: "text-success", label: "Running" },
  stopped: { Icon: Ban, tone: "text-muted", label: "Stopped" },
  degraded: { Icon: AlertTriangle, tone: "text-[#8a5a1c]", label: "Degraded" },
  maintenance: { Icon: RefreshCw, tone: "text-navy", label: "Maintenance" },
} as const;

function StateIcon({ row }: { row: IisApplication }) {
  const { Icon, tone, label } = STATE_ICON[row.status] ?? STATE_ICON.running;
  return (
    <span title={row.active ? label : `${label} · retired`} aria-label={row.active ? label : `${label}, retired`}>
      <Icon className={`h-4 w-4 ${tone}`} aria-hidden />
    </span>
  );
}

export function IisApplicationsTable({
  rows,
  canEdit,
  returnTo,
  onRowAction,
}: {
  rows: IisApplication[];
  canEdit: boolean;
  /** The current filter query, so an action comes back to the same view. */
  returnTo: string;
  onRowAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="overflow-x-auto border border-line bg-surface">
      <table className="w-full min-w-[1080px] text-left">
        <thead>
          <tr className="border-b border-line text-[10.5px] uppercase tracking-[0.09em] text-muted">
            <th className={`${CELL} font-medium`}>Server Name</th>
            <th className={`${CELL} font-medium`}>Application Name</th>
            <th className={`${CELL} font-medium`}>Binding Host</th>
            <th className={`${CELL} text-right font-medium`}>Binding Port</th>
            <th className={`${CELL} text-center font-medium`}>SSL</th>
            <th className={`${CELL} font-medium`}>Application Pool</th>
            <th className={`${CELL} text-center font-medium`}>Directory Browsing</th>
            <th className={`${CELL} font-medium`}>Root Path</th>
            <th className={`${CELL} text-center font-medium`}>State</th>
            <th className={`${CELL} text-right font-medium`}>Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.id} className={row.active ? "hover:bg-[#f9fbfe]" : "opacity-60"}>
              <td className={CELL}>
                <span className="break-all text-[11.5px] text-body">{row.server || "—"}</span>
              </td>

              <td className={CELL}>
                <Link
                  href={`/modules/iis/applications/${row.id}`}
                  className="break-all text-[12.5px] font-medium text-navy hover:underline"
                >
                  {row.name}
                </Link>
                {!row.active && (
                  <span className="ml-1.5 inline-flex items-center gap-1 align-middle text-[10.5px] text-muted">
                    <Ban className="h-3 w-3" aria-hidden />
                    retired
                  </span>
                )}
              </td>

              <td className={CELL}>
                <span className={`break-all ${MONO}`}>{row.bindingHost || "—"}</span>
              </td>

              <td className={`${CELL} text-right tabular-nums text-[12px] text-body`}>
                {row.bindingPort ?? "—"}
              </td>

              <td className={`${CELL} text-center`}>
                <span className="inline-flex items-center justify-center">
                  <SslIcon row={row} />
                </span>
              </td>

              <td className={CELL}>
                <span className="break-all text-[12px] text-body">{row.appPool || "—"}</span>
              </td>

              <td className={`${CELL} text-center`}>
                <span className="inline-flex items-center justify-center">
                  <BrowsingIcon row={row} />
                </span>
              </td>

              <td className={CELL}>
                <span className={`block max-w-[280px] truncate ${MONO}`} title={row.appRoot || undefined}>
                  {row.appRoot || "—"}
                </span>
              </td>

              <td className={`${CELL} text-center`}>
                <span className="inline-flex items-center justify-center">
                  <StateIcon row={row} />
                </span>
              </td>

              <td className={`${CELL} text-right`}>
                <div className="flex items-center justify-end gap-1">
                  <Link
                    href={`/modules/iis/applications/${row.id}`}
                    className={ICON_BUTTON}
                    title="Edit application"
                    aria-label={`Edit ${row.name}`}
                  >
                    <PencilLine className="h-3.5 w-3.5" aria-hidden />
                  </Link>

                  {canEdit && (
                    <>
                      <form action={onRowAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <input
                          type="hidden"
                          name="intent"
                          value={row.active ? "deactivate" : "activate"}
                        />
                        <button
                          type="submit"
                          className={ICON_BUTTON}
                          title={row.active ? "Retire application" : "Bring back"}
                          aria-label={row.active ? `Retire ${row.name}` : `Bring back ${row.name}`}
                        >
                          <Power className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </form>

                      <Link
                        href={`/modules/iis/applications?delete=${row.id}${returnTo ? `&${returnTo.slice(1)}` : ""}`}
                        className={ICON_BUTTON_DANGER}
                        title="Delete application"
                        aria-label={`Delete ${row.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
