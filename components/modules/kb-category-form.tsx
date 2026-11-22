"use client";

import { AlertCircle, CheckCircle2, Loader2, Plus, Save, X } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";

/** The two fields a shelf needs. */
export function KbCategoryForm({
  action,
  category,
  cancelHref = "/modules/tickets/masters/kb-categories",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  /** Present when the form is editing a shelf rather than adding one. */
  category?: { id: string; name: string; description: string };
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);

  return (
    <form action={formAction} className="border border-line bg-surface">
      {category && <input type="hidden" name="id" value={category.id} />}
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-5">
        <p className="text-[12.5px] font-medium text-navy">
          {category ? `Editing "${category.name}"` : "New category"}
        </p>
        {category && (
          <Link
            href={cancelHref}
            className="inline-flex items-center gap-1 text-[11.5px] text-muted hover:text-navy"
          >
            <X className="h-3 w-3" aria-hidden />
            Cancel
          </Link>
        )}
      </div>
      <div className="grid gap-4 px-4 py-4 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end sm:px-5">
        <div>
          <label htmlFor="kb-category-name" className="field-label">
            Name<span className="ml-0.5 text-danger">*</span>
          </label>
          <input
            id="kb-category-name"
            name="name"
            required
            minLength={3}
            maxLength={60}
            defaultValue={category?.name ?? ""}
            placeholder="e.g. Printing"
            className="field"
          />
        </div>
        <div>
          <label htmlFor="kb-category-description" className="field-label">
            Description
          </label>
          <input
            id="kb-category-description"
            name="description"
            maxLength={160}
            defaultValue={category?.description ?? ""}
            placeholder="What belongs on this shelf"
            className="field"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : category ? (
            <Save className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden />
          )}
          {category ? "Save category" : "Add category"}
        </Button>
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
    </form>
  );
}
