"use client";

import { AlertCircle, Check, CheckCircle2, Copy, KeyRound, Loader2, X } from "lucide-react";
import { useActionState, useState } from "react";
import type { KeyFormState } from "@/app/(app)/modules/settings/developers/actions";
import { Button } from "@/components/ui/button";

/**
 * Issue a key.
 *
 * The secret is shown exactly once — the database keeps only an HMAC of it — so
 * the panel that reveals it is the whole interface: copy, confirm, done. If the
 * tab closes first, the key is dead on arrival and the answer is to issue
 * another, which is the honest behaviour of a credential you can revoke.
 */
export function ApiKeyForm({
  action,
  scopes,
}: {
  action: (state: KeyFormState, formData: FormData) => Promise<KeyFormState>;
  scopes: { id: string; label: string; summary: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, {} as KeyFormState);
  const [copied, setCopied] = useState(false);
  const [hidden, setHidden] = useState(false);

  async function copy(secret: string) {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <form action={formAction} className="border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-5">
        <p className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-navy">
          <KeyRound className="h-3.5 w-3.5" aria-hidden />
          New key
        </p>
        <p className="text-[11px] text-muted">Acts as you, and only within the scopes below</p>
      </div>

      <div className="grid gap-4 px-4 py-4 sm:grid-cols-[1fr_180px] sm:px-5">
        <div>
          <label htmlFor="api-key-name" className="field-label">
            Name<span className="ml-0.5 text-danger">*</span>
          </label>
          <input
            id="api-key-name"
            name="name"
            required
            minLength={2}
            maxLength={60}
            placeholder="e.g. Helpdesk chat bridge"
            className="field"
          />
          <p className="mt-1 text-[11px] text-muted">
            Name it after what will use it.
          </p>
        </div>
        <div>
          <label htmlFor="api-key-expiry" className="field-label">
            Expires
          </label>
          <select id="api-key-expiry" name="expiry" defaultValue="90" className="field">
            <option value="30">In 30 days</option>
            <option value="90">In 90 days</option>
            <option value="365">In a year</option>
            <option value="never">Never</option>
          </select>
        </div>

        <fieldset className="sm:col-span-2">
          <legend className="field-label">Scopes</legend>
          <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
            {scopes.map((scope) => (
              <label
                key={scope.id}
                className="flex items-start gap-2.5 border border-line px-2.5 py-2 transition-colors hover:bg-[#f7f9fc]"
              >
                <input
                  type="checkbox"
                  name="scopes"
                  value={scope.id}
                  className="mt-0.5 h-3.5 w-3.5 accent-[#1d3a5f]"
                />
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium text-navy">{scope.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                    {scope.summary}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            Only the scopes your access level allows are listed.
          </p>
        </fieldset>
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

      {state.secret && !hidden && (
        <div className="mx-4 mb-4 border border-[#cfe4d4] bg-success-soft px-3 py-2.5 text-success sm:mx-5">
          <p className="flex items-start gap-2 text-[12.5px]">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {state.message}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all bg-white px-2 py-1.5 font-mono text-[11.5px] text-navy">
              {state.secret}
            </code>
            <Button type="button" size="sm" variant="secondary" onClick={() => copy(state.secret!)}>
              {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <button
              type="button"
              onClick={() => setHidden(true)}
              className="inline-flex items-center gap-1 text-[11.5px] text-success/80 underline-offset-2 hover:underline"
            >
              <X className="h-3 w-3" aria-hidden />
              I have saved it
            </button>
          </div>
        </div>
      )}

      {state.secret && hidden && (
        <p className="mx-4 mb-4 border border-line bg-[#f7f9fc] px-3 py-2 text-[12px] text-muted sm:mx-5">
          &quot;{state.keyName}&quot; is listed below with its prefix. The secret is not stored
          anywhere — if it was lost before you copied it, revoke the key and issue another.
        </p>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
        <p className="text-[11.5px] text-muted">
          Shown once. {scopes.length} scopes available to you.
        </p>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <KeyRound className="h-3.5 w-3.5" aria-hidden />
          )}
          Issue key
        </Button>
      </div>
    </form>
  );
}
