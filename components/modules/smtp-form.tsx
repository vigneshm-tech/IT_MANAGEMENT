"use client";

import { AlertCircle, CheckCircle2, Loader2, MailCheck, Save } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import { SMTP_TLS_LABELS, type SmtpDisplay, type SmtpTls } from "@/lib/email/types";

const FIELD = "field mt-1 text-[12px]";
const LABEL = "block text-[11.5px] font-medium text-body";

/**
 * The workspace's mail server.
 *
 * Two forms, deliberately: saving and testing are different intentions, and a
 * test that saved whatever happened to be typed would be a way to break alerts
 * by pressing the wrong button.
 */
export function SmtpForm({
  saveAction,
  testAction,
  current,
  testDefaultTo,
}: {
  saveAction: (state: FormState, formData: FormData) => Promise<FormState>;
  testAction: (state: FormState, formData: FormData) => Promise<FormState>;
  current: SmtpDisplay | null;
  testDefaultTo: string;
}) {
  const [saveState, save, saving] = useActionState(saveAction, {} as FormState);
  const [testState, test, testing] = useActionState(testAction, {} as FormState);

  const tls: SmtpTls = current?.tls ?? "starttls";

  return (
    <div className="space-y-3">
      <form action={save} className="border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 sm:px-5">
          <p className="text-[12.5px] font-medium text-navy">Mail server</p>
          <p className="text-[11px] text-muted">Settings administrators only</p>
        </div>

        <div className="space-y-3 px-4 py-4 sm:px-5">
          {saveState.error && (
            <p
              role="alert"
              className="flex items-start gap-2 border border-[#f0d5d5] bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {saveState.error}
            </p>
          )}
          {saveState.message && !saveState.error && (
            <p className="flex items-center gap-2 border border-[#cfe3d2] bg-success-soft px-3 py-2 text-[12.5px] text-success">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              {saveState.message}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor="smtp-host">
                Host
              </label>
              <input
                id="smtp-host"
                name="host"
                defaultValue={current?.host ?? ""}
                placeholder="smtp.example.com"
                required
                className={FIELD}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="smtp-port">
                Port
              </label>
              <input
                id="smtp-port"
                name="port"
                type="number"
                min={1}
                max={65535}
                defaultValue={current?.port ?? 587}
                className={FIELD}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={LABEL} htmlFor="smtp-tls">
                Encryption
              </label>
              <select id="smtp-tls" name="tls" defaultValue={tls} className={FIELD}>
                {(Object.keys(SMTP_TLS_LABELS) as SmtpTls[]).map((key) => (
                  <option key={key} value={key}>
                    {SMTP_TLS_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={LABEL} htmlFor="smtp-username">
                Username
              </label>
              <input
                id="smtp-username"
                name="username"
                defaultValue={current?.username ?? ""}
                autoComplete="off"
                className={FIELD}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="smtp-password">
                Password
              </label>
              <input
                id="smtp-password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder={current?.passwordHint ? `Stored — ending ${current.passwordHint}` : ""}
                className={FIELD}
              />
              <p className="mt-1 text-[11px] text-muted">Leave blank to keep the stored password.</p>
            </div>

            <div>
              <label className={LABEL} htmlFor="smtp-from-address">
                From address
              </label>
              <input
                id="smtp-from-address"
                name="fromAddress"
                type="email"
                defaultValue={current?.fromAddress ?? ""}
                placeholder="it-alerts@example.com"
                required
                className={FIELD}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="smtp-from-name">
                From name
              </label>
              <input
                id="smtp-from-name"
                name="fromName"
                defaultValue={current?.fromName ?? ""}
                placeholder="TaskTornado alerts"
                className={FIELD}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Save className="h-3.5 w-3.5" aria-hidden />
              )}
              Save mail server
            </Button>
          </div>
        </div>
      </form>

      <form action={test} className="border border-line bg-surface">
        <div className="border-b border-line px-4 py-2.5 sm:px-5">
          <p className="text-[12.5px] font-medium text-navy">Send a test message</p>
        </div>
        <div className="space-y-3 px-4 py-4 sm:px-5">
          {testState.error && (
            <p
              role="alert"
              className="flex items-start gap-2 border border-[#f0d5d5] bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {testState.error}
            </p>
          )}
          {testState.message && !testState.error && (
            <p className="flex items-center gap-2 border border-[#cfe3d2] bg-success-soft px-3 py-2 text-[12.5px] text-success">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              {testState.message}
            </p>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <label className={LABEL} htmlFor="smtp-test-to">
                Send to
              </label>
              <input
                id="smtp-test-to"
                name="to"
                type="email"
                defaultValue={testDefaultTo}
                className={FIELD}
              />
            </div>
            <Button type="submit" size="sm" variant="secondary" disabled={testing}>
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <MailCheck className="h-3.5 w-3.5" aria-hidden />
              )}
              {testing ? "Sending" : "Send test"}
            </Button>
          </div>
          <p className="text-[11px] text-muted">
            The test uses the settings as saved — save first if you have just changed them.
          </p>
        </div>
      </form>
    </div>
  );
}
