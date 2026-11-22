"use client";

import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, Plus, Save } from "lucide-react";
import { useActionState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";

/**
 * Add and edit share one form: the snippet is a name, keywords and a body, and
 * the two modes differ only in which action they post to.
 */
export function TextModuleForm({
  action,
  id,
  name = "",
  keywords = "",
  body = "",
  submitLabel,
  basePath,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  id?: string;
  name?: string;
  keywords?: string;
  body?: string;
  submitLabel: string;
  basePath: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const editing = Boolean(id);

  return (
    <form action={formAction} className="border border-line bg-surface">
      {id && <input type="hidden" name="id" value={id} />}

      <div className="grid grid-cols-1 gap-x-5 gap-y-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <div>
          <label htmlFor="name" className="field-label">
            Name<span className="ml-0.5 text-danger">*</span>
          </label>
          <input
            id="name"
            name="name"
            required
            minLength={3}
            maxLength={60}
            defaultValue={name}
            placeholder="e.g. Acknowledge and set expectations"
            className="field"
          />
        </div>
        <div>
          <label htmlFor="keywords" className="field-label">
            Keywords
          </label>
          <input
            id="keywords"
            name="keywords"
            maxLength={80}
            defaultValue={keywords}
            placeholder="ack, received"
            className="field"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="body" className="field-label">
            Text<span className="ml-0.5 text-danger">*</span>
          </label>
          <textarea
            id="body"
            name="body"
            required
            rows={6}
            maxLength={4000}
            defaultValue={body}
            placeholder="The reply an agent inserts with one click. Line breaks are kept."
            className="field resize-none"
          />
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
      {state.ok && state.message && (
        <p
          role="status"
          className="mx-4 mb-4 flex items-start gap-2 border border-[#cfe4d4] bg-success-soft px-3 py-2 text-[12.5px] text-success sm:mx-5"
        >
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">
        {editing && (
          <Link href={basePath} className={buttonClass({ variant: "secondary", size: "sm" })}>
            Cancel
          </Link>
        )}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : editing ? (
            <Save className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden />
          )}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
