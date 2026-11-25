"use client";

import { AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";

/**
 * How the probe reads what it sees.
 *
 * Two situations make an honest site look broken: a network that inspects TLS
 * (the certificate is then issued by the proxy, not the site) and a site behind
 * Windows authentication (it answers 401 to everyone). Both are the workspace's
 * call — the probe should not guess, and should not cry wolf.
 */
export function ProbePolicyForm({
  action,
  initialInsecure,
  initialAuthAsUp,
  initialToken,
  summaryUrl,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initialInsecure: boolean;
  initialAuthAsUp: boolean;
  initialToken: string;
  summaryUrl: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);

  return (
    <form action={formAction} className="border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 sm:px-5">
        <p className="text-[12.5px] font-medium text-navy">Probes &amp; certificates</p>
        <p className="text-[11px] text-muted">IT Manager and super admin only</p>
      </div>

      <div className="space-y-3 px-4 py-4 sm:px-5">
        {state.error && (
          <p
            role="alert"
            className="flex items-start gap-2 border border-[#f0d5d5] bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {state.error}
          </p>
        )}
        {state.message && !state.error && (
          <p className="flex items-center gap-2 border border-[#cfe3d2] bg-success-soft px-3 py-2 text-[12.5px] text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {state.message}
          </p>
        )}

        <label className="flex items-start gap-2 text-[12.5px] text-body">
          <input
            type="checkbox"
            name="allowInsecureTls"
            defaultChecked={initialInsecure}
            className="mt-0.5 h-3.5 w-3.5 rounded border-line-strong"
          />
          <span>
            Trust internal certificates
            <span className="mt-0.5 block text-[11px] text-muted">
              For networks that inspect TLS. Without it, every https site behind such a proxy reads
              “certificate could not be verified”. Certificate expiry is still reported either way.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-[12.5px] text-body">
          <input
            type="checkbox"
            name="treatAuthAsUp"
            defaultChecked={initialAuthAsUp}
            className="mt-0.5 h-3.5 w-3.5 rounded border-line-strong"
          />
          <span>
            Treat 401 and 403 as up
            <span className="mt-0.5 block text-[11px] text-muted">
              A login prompt from a site behind Windows authentication is the site working.
            </span>
          </span>
        </label>

        <div className="border-t border-line pt-3">
          <label htmlFor="probe-token" className="field-label">
            Summary token
          </label>
          <input
            id="probe-token"
            name="summaryToken"
            defaultValue={initialToken}
            placeholder="at least 16 characters — empty turns it off"
            className="field mt-1 w-full font-mono text-[12px]"
          />
          <p className="mt-1 text-[11px] text-muted">
            A read-only JSON view at <span className="font-mono">{summaryUrl}</span>, for a status page
            or a badge: <span className="font-mono">?token=…</span>. Empty turns the endpoint off.
          </p>
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="h-3.5 w-3.5" aria-hidden />
            )}
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}
