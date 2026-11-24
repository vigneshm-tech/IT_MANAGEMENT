"use client";

import { AlertCircle, Loader2, Save } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import { ROLE_LABEL_MAX, ROLE_DESCRIPTION_MAX, ROLE_GROUPS_FOR_PICKER } from "@/lib/roles/types";
import type { RoleGroup, RoleLevel } from "@/lib/roles";

const LEVELS: { id: RoleLevel; label: string; hint: string }[] = [
  { id: "engineer", label: "Engineer", hint: "Works within the task window" },
  { id: "lead", label: "Lead", hint: "Runs a shift or a squad" },
  { id: "manager", label: "Manager", hint: "Owns a team" },
  { id: "executive", label: "Executive", hint: "Cross-functional oversight" },
];

const FIELD = "field text-[12px]";
const LABEL = "block text-[11.5px] font-medium text-body";

/**
 * The badge half of a role: what it is called and where it belongs in the
 * catalogue. Where it is called "badge half" because the permissions are the
 * other half, and mixing the two in one form makes people save access changes
 * they did not intend.
 */
export function RoleMetaForm({
  mode,
  action,
  role,
}: {
  mode: "create" | "edit";
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  role?: { id: string; label: string; description: string; group: RoleGroup; level: RoleLevel };
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);

  return (
    <form action={formAction} className="space-y-3 border border-line bg-surface px-4 py-4 sm:px-5">
      {mode === "edit" && <input type="hidden" name="id" value={role?.id ?? ""} />}

      {state.error && (
        <p role="alert" className="flex items-start gap-2 border border-[#f0d5d5] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="role-label">
            Role name
          </label>
          <input
            id="role-label"
            name="label"
            defaultValue={role?.label ?? ""}
            maxLength={ROLE_LABEL_MAX}
            placeholder="Warehouse Supervisor"
            required
            className={`${FIELD} mt-1`}
          />
          {mode === "create" && (
            <p className="mt-1 text-[11px] text-muted">
              Its key is made from the name — &ldquo;Warehouse Supervisor&rdquo; becomes{" "}
              <code className="font-mono">warehouse_supervisor</code>.
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="role-description">
            What this role is for
          </label>
          <input
            id="role-description"
            name="description"
            defaultValue={role?.description ?? ""}
            maxLength={ROLE_DESCRIPTION_MAX}
            placeholder="Runs the warehouse floor and the stock portal"
            className={`${FIELD} mt-1`}
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="role-group">
            Group
          </label>
          <select
            id="role-group"
            name="group"
            defaultValue={role?.group ?? "custom"}
            className={`${FIELD} mt-1`}
          >
            {ROLE_GROUPS_FOR_PICKER.map((group) => (
              <option key={group.id} value={group.id}>
                {group.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL} htmlFor="role-level">
            Seniority
          </label>
          <select
            id="role-level"
            name="level"
            defaultValue={role?.level ?? "engineer"}
            className={`${FIELD} mt-1`}
          >
            {LEVELS.map((level) => (
              <option key={level.id} value={level.id}>
                {level.label} — {level.hint}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Save className="h-3.5 w-3.5" aria-hidden />
          )}
          {mode === "create" ? "Create role" : "Save details"}
        </Button>
      </div>
    </form>
  );
}
