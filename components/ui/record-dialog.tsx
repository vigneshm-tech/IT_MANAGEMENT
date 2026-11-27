"use client";

import { AlertCircle, CheckCircle2, Loader2, Plus } from "lucide-react";
import { useActionState, useEffect, useId, useState } from "react";
import { Button } from "./button";
import type { FormState } from "@/lib/forms";
import { Dialog } from "./dialog";

export type FieldDef = {
  name: string;
  label: string;
  type: "text" | "email" | "password" | "date" | "number" | "select" | "textarea";
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string;
  span?: 1 | 2;
  min?: string;
  step?: string;
};

export function RecordDialog({
  title,
  description,
  fields,
  action,
  submitLabel,
  triggerLabel,
  triggerVariant = "primary",
  hidden,
  size = "md",
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  fields: FieldDef[];
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  triggerLabel: string;
  triggerVariant?: "primary" | "secondary";
  hidden?: Record<string, string>;
  size?: "sm" | "md" | "lg";
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [state, formAction, pending] = useActionState(action, {});
  const formId = useId();

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
    }
  }, [state]);

  useEffect(() => {
    if (!open) {
      // Allow the same dialog to be reopened with a clean form.
      const form = document.getElementById(formId) as HTMLFormElement | null;
      form?.reset();
    }
  }, [open, formId]);

  return (
    <>
      <Button type="button" variant={triggerVariant} onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" aria-hidden />
        {triggerLabel}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        size={size}
      >
        <form id={formId} action={formAction} className="space-y-4">
          {hidden &&
            Object.entries(hidden).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}

          <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
            {fields.map((field) => (
              <div
                key={field.name}
                className={field.span === 2 ? "sm:col-span-2" : undefined}
              >
                <label htmlFor={`${formId}-${field.name}`} className="field-label">
                  {field.label}
                  {field.required && <span className="ml-0.5 text-danger">*</span>}
                </label>

                {field.type === "select" ? (
                  <select
                    id={`${formId}-${field.name}`}
                    name={field.name}
                    required={field.required}
                    defaultValue={field.defaultValue}
                    className="field"
                  >
                    {!field.required && <option value="">—</option>}
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === "textarea" ? (
                  <textarea
                    id={`${formId}-${field.name}`}
                    name={field.name}
                    rows={3}
                    required={field.required}
                    placeholder={field.placeholder}
                    defaultValue={field.defaultValue}
                    className="field resize-none"
                  />
                ) : (
                  <input
                    id={`${formId}-${field.name}`}
                    name={field.name}
                    type={field.type}
                    required={field.required}
                    placeholder={field.placeholder}
                    defaultValue={field.defaultValue}
                    min={field.min}
                    step={field.step}
                    className="field"
                  />
                )}
              </div>
            ))}
          </div>

          {state.error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {state.error}
            </p>
          )}
          {state.ok && state.message && (
            <p className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-[12.5px] text-success">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              {state.message}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {submitLabel}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
