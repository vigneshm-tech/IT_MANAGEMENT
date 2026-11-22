"use client";

import { AlertCircle, CheckCircle2, Loader2, Plus, Save } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import {
  KB_BODY_MAX,
  KB_SUMMARY_MAX,
  KB_TITLE_MAX,
  KB_VISIBILITIES,
} from "@/lib/tickets/kb";
import type { KbArticleRecord, KbCategoryRecord } from "@/lib/records/repository";

function Notice({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="mx-4 mb-4 flex items-start gap-2 border border-[#eccfcd] bg-danger-soft px-3 py-2 text-[12.5px] text-danger sm:mx-5"
      >
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {state.error}
      </p>
    );
  }
  if (state.ok && state.message) {
    return (
      <p
        role="status"
        className="mx-4 mb-4 flex items-start gap-2 border border-[#cfe4d4] bg-success-soft px-3 py-2 text-[12.5px] text-success sm:mx-5"
      >
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {state.message}
      </p>
    );
  }
  return null;
}

/**
 * One form for both jobs: a new article and an edit of an existing one. The
 * fields are identical, so the only difference is the submit label and whether
 * the values start filled in.
 */
export function KbArticleForm({
  action,
  categories,
  article,
  canEdit,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  categories: KbCategoryRecord[];
  article?: KbArticleRecord;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const idPrefix = article ? "kb-edit" : "kb-new";
  const disabled = !canEdit || pending;

  return (
    <form action={formAction} className="border border-line bg-surface">
      {article && <input type="hidden" name="id" value={article.id} />}

      <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <div className="sm:col-span-2">
          <label htmlFor={`${idPrefix}-title`} className="field-label">
            Title<span className="ml-0.5 text-danger">*</span>
          </label>
          <input
            id={`${idPrefix}-title`}
            name="title"
            required
            minLength={4}
            maxLength={KB_TITLE_MAX}
            defaultValue={article?.title ?? ""}
            placeholder="The problem, in the words a requester would use"
            className="field"
            disabled={disabled}
          />
        </div>

        <div>
          <label htmlFor={`${idPrefix}-category`} className="field-label">
            Category<span className="ml-0.5 text-danger">*</span>
          </label>
          <select
            id={`${idPrefix}-category`}
            name="categoryId"
            required
            defaultValue={article?.categoryId ?? categories[0]?.id ?? ""}
            className="field"
            disabled={disabled}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.status === "inactive" ? " (inactive)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${idPrefix}-visibility`} className="field-label">
            Who can read it
          </label>
          <select
            id={`${idPrefix}-visibility`}
            name="visibility"
            defaultValue={article?.visibility ?? "public"}
            className="field"
            disabled={disabled}
          >
            {KB_VISIBILITIES.map((visibility) => (
              <option key={visibility.id} value={visibility.id}>
                {visibility.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted">
            {KB_VISIBILITIES.find((item) => item.id === (article?.visibility ?? "public"))?.hint}
          </p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={`${idPrefix}-summary`} className="field-label">
            One-line summary
          </label>
          <input
            id={`${idPrefix}-summary`}
            name="summary"
            maxLength={KB_SUMMARY_MAX}
            defaultValue={article?.summary ?? ""}
            placeholder="Shown under the title in search results"
            className="field"
            disabled={disabled}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={`${idPrefix}-body`} className="field-label">
            Article<span className="ml-0.5 text-danger">*</span>
          </label>
          <textarea
            id={`${idPrefix}-body`}
            name="body"
            required
            rows={10}
            maxLength={KB_BODY_MAX}
            defaultValue={article?.body ?? ""}
            placeholder="Steps, in order. A blank line starts a new paragraph; a line starting with 1. or - becomes a list."
            className="field resize-y font-sans"
            disabled={disabled}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={`${idPrefix}-tags`} className="field-label">
            Tags
          </label>
          <input
            id={`${idPrefix}-tags`}
            name="tags"
            defaultValue={(article?.tags ?? []).join(", ")}
            placeholder="vpn, password, printer"
            className="field"
            disabled={disabled}
          />
          <p className="mt-1 text-[11px] text-muted">
            Comma separated. Tags carry more weight than body text when an agent searches mid-reply.
          </p>
        </div>
      </div>

      <Notice state={state} />

      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
        <p className="text-[11.5px] text-muted">
          {canEdit
            ? "Saved changes are live on the public site immediately, if the article is public."
            : "Your role can read the knowledge base but not change it."}
        </p>
        {canEdit && (
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : article ? (
              <Save className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Plus className="h-3.5 w-3.5" aria-hidden />
            )}
            {article ? "Save article" : "Publish article"}
          </Button>
        )}
      </div>
    </form>
  );
}
