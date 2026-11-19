"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Database,
  KeyRound,
  Link2,
  Loader2,
  Server,
  Ticket,
  Unplug,
} from "lucide-react";
import { useActionState, useState } from "react";
import {
  disconnectIntegrationAction,
  saveIntegrationAction,
  type IntegrationState,
} from "@/app/(app)/modules/settings/actions";
import type { IntegrationProvider, IntegrationStatus } from "@/lib/integrations/store";

const initial: IntegrationState = {};

function IntegrationForm({
  provider,
  status,
  canManage,
  accent,
  title,
  description,
  placeholder,
  needsUrl,
  docsHint,
}: {
  provider: IntegrationProvider;
  status: IntegrationStatus;
  canManage: boolean;
  accent: string;
  title: string;
  description: string;
  placeholder: string;
  needsUrl: boolean;
  docsHint: string;
}) {
  const [state, action, pending] = useActionState(saveIntegrationAction, initial);
  const [editing, setEditing] = useState(!status.connected);

  const Icon = provider === "redmine" ? Ticket : Server;

  return (
    <div className="rounded-2xl border border-line/70 bg-surface/50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]"
            style={{ color: accent }}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h3 className="text-[13.5px] font-semibold text-ink">{title}</h3>
            <p className="mt-0.5 max-w-md text-[11.5px] leading-relaxed text-muted">{description}</p>
          </div>
        </div>
        <span
          className={
            status.connected
              ? "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-success"
              : "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted"
          }
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${status.connected ? "bg-success" : "bg-muted"}`}
          />
          {status.connected ? "Connected" : "Not connected"}
        </span>
      </div>

      {status.connected && !editing ? (
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line/70 bg-base/40 px-3 py-2.5">
            <div className="min-w-0">
              {status.baseUrl && (
                <p className="flex items-center gap-1.5 truncate text-[11px] text-muted">
                  <Link2 className="h-3 w-3" aria-hidden />
                  {status.baseUrl}
                </p>
              )}
              <p className="mt-0.5 font-mono text-[12px] text-ink/90">{status.masked}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={!canManage}
                className="rounded-lg border border-line bg-surface-2/70 px-2.5 py-1.5 text-[11.5px] font-medium text-ink transition hover:border-white/20 disabled:opacity-50"
              >
                Replace
              </button>
              <form action={disconnectIntegrationAction}>
                <input type="hidden" name="provider" value={provider} />
                <button
                  type="submit"
                  disabled={!canManage}
                  className="inline-flex items-center gap-1 rounded-lg border border-danger/25 bg-danger/10 px-2.5 py-1.5 text-[11.5px] font-medium text-danger transition hover:bg-danger/20 disabled:opacity-50"
                >
                  <Unplug className="h-3 w-3" aria-hidden />
                  Remove
                </button>
              </form>
            </div>
          </div>
          <p className="text-[10.5px] text-muted/70">
            Saved {status.updatedAt ? new Date(status.updatedAt).toLocaleString("en-GB") : "just now"} ·
            masked on purpose, the full key never returns to the browser.
          </p>
        </div>
      ) : (
        <form action={action} className="mt-4 space-y-2.5">
          <input type="hidden" name="provider" value={provider} />
          {needsUrl && (
            <div>
              <label
                htmlFor={`${provider}-url`}
                className="mb-1 block text-[11.5px] font-medium text-ink/80"
              >
                Redmine URL
              </label>
              <input
                id={`${provider}-url`}
                name="baseUrl"
                type="url"
                required
                defaultValue={status.baseUrl ?? ""}
                placeholder="https://redmine.yourcompany.com"
                className="w-full rounded-lg border border-line bg-base/60 px-3 py-2 text-[12.5px] text-ink placeholder:text-muted/60 focus:border-brand/60 focus:outline-none"
              />
            </div>
          )}
          <div>
            <label
              htmlFor={`${provider}-key`}
              className="mb-1 block text-[11.5px] font-medium text-ink/80"
            >
              API key
            </label>
            <div className="relative">
              <KeyRound
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <input
                id={`${provider}-key`}
                name="secret"
                type="password"
                required
                minLength={12}
                disabled={!canManage}
                autoComplete="off"
                placeholder={placeholder}
                className="w-full rounded-lg border border-line bg-base/60 py-2 pl-9 pr-3 font-mono text-[12px] text-ink placeholder:font-sans placeholder:text-muted/60 focus:border-brand/60 focus:outline-none disabled:opacity-50"
              />
            </div>
            <p className="mt-1 text-[10.5px] text-muted/70">{docsHint}</p>
          </div>

          <AnimatePresence initial={false}>
            {state.error && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                role="alert"
                className="flex items-start gap-1.5 overflow-hidden text-[11.5px] text-rose-300"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {state.error}
              </motion.p>
            )}
            {state.ok && state.message && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-1.5 text-[11.5px] text-success"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                {state.message}
              </motion.p>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending || !canManage}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand/90 px-3 py-1.5 text-[11.5px] font-semibold text-white transition hover:bg-brand disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Check className="h-3.5 w-3.5" aria-hidden />
              )}
              Save key
            </button>
            {status.connected && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg border border-line bg-surface-2/60 px-3 py-1.5 text-[11.5px] text-muted transition hover:text-ink"
              >
                Cancel
              </button>
            )}
            {!canManage && (
              <span className="text-[10.5px] text-warning">IT configures this key</span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

export function IntegrationSection({
  redmine,
  action1,
  canManageAction1,
}: {
  redmine: IntegrationStatus;
  action1: IntegrationStatus;
  canManageAction1: boolean;
}) {
  return (
    <section aria-labelledby="integrations-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2
            id="integrations-heading"
            className="flex items-center gap-2 text-[15px] font-semibold text-ink"
          >
            <Database className="h-4 w-4 text-brand-soft" aria-hidden />
            Integration keys
          </h2>
          <p className="mt-0.5 text-[12px] text-muted">
            Each employee connects their own Redmine key. Action1 is an IT-wide key.
          </p>
        </div>
        <span className="rounded-full border border-warning/25 bg-warning/10 px-2 py-1 text-[10px] uppercase tracking-wide text-warning">
          Demo vault
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
        <IntegrationForm
          provider="redmine"
          status={redmine}
          canManage
          accent="#fb7185"
          title="Redmine ticket portal"
          description="Used by the Ticket Portal to pull the tickets assigned to you and to close them."
          placeholder="paste your Redmine API key"
          needsUrl
          docsHint="Redmine → My account → API access key. Stored per user."
        />
        <IntegrationForm
          provider="action1"
          status={action1}
          canManage={canManageAction1}
          accent="#a78bfa"
          title="Action1 servers"
          description="Powers the Servers module — endpoint inventory, patch status and last seen time."
          placeholder="paste the Action1 API key"
          needsUrl={false}
          docsHint="Action1 → Settings → API credentials. Only IT Manager and IT Engineer can edit."
        />
      </div>

      <p className="text-[10.5px] leading-relaxed text-muted/60">
        Milestone 1 stores keys in process memory only, for the session. Production writes them to an
        encrypted Supabase Vault table with row-level security.
      </p>
    </section>
  );
}
