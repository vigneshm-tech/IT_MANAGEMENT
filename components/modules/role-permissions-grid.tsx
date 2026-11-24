"use client";

import { AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import type { ModuleId } from "@/lib/modules";
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_LABELS,
  type AccessLevel,
} from "@/lib/roles/permissions";

export type GridModule = {
  id: ModuleId;
  title: string;
  summary: string;
  groupLabel: string;
  level: AccessLevel;
};

export type GridGroup = { id: string; label: string; modules: GridModule[] };

/**
 * One row per module, three answers per row.
 *
 * The licence to keep this simple is that the three answers mean exactly what
 * they say: Not allowed removes the module from the person's navigation and
 * blocks its pages; Read only shows it and refuses changes; Write allows both.
 * Anything finer — "may approve but not edit" — is not something an
 * administrator should have to reason about on thirteen rows.
 */
export function RolePermissionsGrid({
  roleId,
  groups,
  action,
  readOnly = false,
}: {
  roleId: string;
  groups: GridGroup[];
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  readOnly?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={roleId} />

      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 border border-[#f0d5d5] bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p className="flex items-center gap-2 border border-[#cfe3d2] bg-success-soft px-3 py-2 text-[12.5px] text-success">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {state.message}
        </p>
      )}

      <div className="overflow-x-auto border border-line bg-surface">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-line bg-[#f7f9fc] text-[10.5px] uppercase tracking-[0.09em] text-muted">
              <th scope="col" className="px-4 py-2.5 font-medium">
                Module
              </th>
              {ACCESS_LEVELS.map((level) => (
                <th key={level} scope="col" className="w-[120px] px-3 py-2.5 text-center font-medium">
                  {ACCESS_LEVEL_LABELS[level]}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.id}>
              <tr className="border-y border-line bg-[#f4f7fc]">
                <th
                  colSpan={4}
                  scope="colgroup"
                  className="px-4 py-1.5 text-left text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted"
                >
                  {group.label}
                </th>
              </tr>
              {group.modules.map((module) => (
                <tr key={module.id} className="border-b border-line last:border-0">
                  <th scope="row" className="px-4 py-2.5 text-left font-normal">
                    <span className="block text-[12.5px] font-medium text-navy">{module.title}</span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">
                      {module.summary}
                    </span>
                  </th>
                  {ACCESS_LEVELS.map((level) => (
                    <td key={level} className="px-3 py-2.5 text-center">
                      <label className="inline-flex cursor-pointer items-center justify-center">
                        <input
                          type="radio"
                          name={`module:${module.id}`}
                          value={level}
                          defaultChecked={module.level === level}
                          disabled={readOnly}
                          className="peer sr-only"
                          aria-label={`${module.title}: ${ACCESS_LEVEL_LABELS[level]}`}
                        />
                        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-line-strong bg-surface text-transparent transition-colors peer-checked:border-navy peer-checked:bg-navy peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-gold/70">
                          <span
                            className={
                              level === "write"
                                ? "h-2 w-2 rounded-full bg-current"
                                : level === "read"
                                  ? "h-2 w-2 rounded-sm bg-current"
                                  : "h-2 w-2 rounded-full border border-current"
                            }
                          />
                        </span>
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11.5px] text-muted">
            Read only can view. Write can add, edit and approve.
          </p>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="h-3.5 w-3.5" aria-hidden />
            )}
            {pending ? "Saving…" : "Save permissions"}
          </Button>
        </div>
      )}
    </form>
  );
}
