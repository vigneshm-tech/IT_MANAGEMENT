import { Check, Minus, ShieldCheck } from "lucide-react";
import { accessMap } from "@/lib/access";
import { MODULES } from "@/lib/modules";
import { ROLE_BY_ID, type RoleId } from "@/lib/roles";

const COLUMNS = [
  { key: "view", label: "View" },
  { key: "edit", label: "Edit" },
  { key: "approve", label: "Approve" },
  { key: "admin", label: "Admin" },
] as const;

export function AccessMatrix({ role }: { role: RoleId }) {
  const access = accessMap(role);
  const meta = ROLE_BY_ID[role];

  return (
    <section aria-labelledby="access-heading" className="rounded-2xl border border-line/70 bg-surface/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="access-heading" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <ShieldCheck className="h-4 w-4 text-brand-soft" aria-hidden />
            Your access matrix
          </h2>
          <p className="mt-0.5 text-[12px] text-muted">
            Every capability granted to <span style={{ color: meta.accent }}>{meta.label}</span>,
            straight from the permission registry.
          </p>
        </div>
        <span className="rounded-full border border-line bg-surface-2 px-2 py-1 text-[10px] uppercase tracking-wide text-muted">
          Server-enforced
        </span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-y-1 text-left">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.12em] text-muted">
              <th className="pb-1 pl-2 font-medium">Module</th>
              {COLUMNS.map((column) => (
                <th key={column.key} className="pb-1 text-center font-medium">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULES.map((module) => {
              const capabilities = access[module.id];
              return (
                <tr key={module.id} className="bg-surface-2/40">
                  <td className="rounded-l-lg py-2 pl-2">
                    <span className="flex items-center gap-2 text-[12px] text-ink/90">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: module.accent }}
                        aria-hidden
                      />
                      {module.title}
                    </span>
                  </td>
                  {COLUMNS.map((column, index) => {
                    const granted = capabilities[column.key];
                    return (
                      <td
                        key={column.key}
                        className={`py-2 text-center ${index === COLUMNS.length - 1 ? "rounded-r-lg" : ""}`}
                      >
                        {granted ? (
                          <Check className="mx-auto h-3.5 w-3.5 text-success" aria-label="Allowed" />
                        ) : (
                          <Minus className="mx-auto h-3.5 w-3.5 text-muted/30" aria-label="Not allowed" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
