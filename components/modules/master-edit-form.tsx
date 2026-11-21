"use client";

import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";
import { useActionState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import type { MasterModuleOption } from "@/components/modules/master-register";

/**
 * Edit form shared by the master registers. One entry, one page, no popup —
 * saving redirects back to the register with a confirmation line.
 */
export function MasterEditForm({
  id,
  name,
  module,
  modules = [],
  defaultModule,
  nameLabel = "Name",
  nameErrorHint,
  moduleLabel = "Module",
  action,
  basePath,
}: {
  id: string;
  name: string;
  module?: string;
  modules?: MasterModuleOption[];
  defaultModule?: string;
  nameLabel?: string;
  nameErrorHint?: string;
  moduleLabel?: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  basePath: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const showsModule = modules.length > 0;

  return (
    <form action={formAction} className="border border-line bg-surface">
      <input type="hidden" name="id" value={id} />

      <div className="grid grid-cols-1 gap-x-5 gap-y-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <div>
          <label htmlFor="name" className="field-label">
            {nameLabel}
            <span className="ml-0.5 text-danger">*</span>
          </label>
          <input
            id="name"
            name="name"
            required
            minLength={2}
            maxLength={60}
            defaultValue={name}
            className="field"
          />
          {nameErrorHint && <p className="mt-1.5 text-[11.5px] text-muted">{nameErrorHint}</p>}
        </div>

        {showsModule && (
          <div>
            <label htmlFor="module" className="field-label">
              {moduleLabel}
              <span className="ml-0.5 text-danger">*</span>
            </label>
            <select
              id="module"
              name="module"
              required
              defaultValue={module ?? defaultModule}
              className="field"
            >
              {modules.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
        <p className="text-[11.5px] text-muted">Ref {id}</p>
        <div className="flex items-center gap-2">
          <Link href={basePath} className={buttonClass({ variant: "secondary", size: "sm" })}>
            Cancel
          </Link>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Save changes
          </Button>
        </div>
      </div>

      {state.error && (
        <p
          role="alert"
          className="mx-4 mb-4 flex items-start gap-2 border border-[#eccfcd] bg-danger-soft px-3 py-2 text-[12.5px] text-danger sm:mx-5"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}
    </form>
  );
}
