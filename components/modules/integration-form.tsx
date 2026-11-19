"use client";

import { CheckCircle2, Loader2, Unplug } from "lucide-react";
import { useActionState, useState } from "react";
import {
  disconnectIntegrationAction,
  saveIntegrationAction,
  type IntegrationState,
} from "@/app/(app)/modules/settings/actions";
import type { IntegrationProvider, IntegrationStatus } from "@/lib/integrations/store";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { formatDate } from "@/lib/format";

const initial: IntegrationState = {};

export function IntegrationForm({
  provider,
  status,
  canManage,
  needsUrl,
  secretPlaceholder,
  urlPlaceholder,
  hint,
  managedBy,
}: {
  provider: IntegrationProvider;
  status: IntegrationStatus;
  canManage: boolean;
  needsUrl: boolean;
  secretPlaceholder: string;
  urlPlaceholder?: string;
  hint: string;
  managedBy?: string;
}) {
  const [state, formAction, pending] = useActionState(saveIntegrationAction, initial);
  const [editing, setEditing] = useState(!status.connected);

  if (!canManage) {
    return (
      <p className="text-[12px] leading-relaxed text-muted">
        {managedBy ?? "This connection is managed by IT."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={status.connected ? "connected" : "pending"} />
        {status.connected ? (
          <>
            <span className="font-mono text-[11.5px] text-body">{status.masked}</span>
            {status.updatedAt && (
              <span className="text-[11.5px] text-muted">· saved {formatDate(status.updatedAt)}</span>
            )}
          </>
        ) : (
          <span className="text-[11.5px] text-muted">No key saved</span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {status.connected && !editing && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Replace key
            </Button>
          )}
          {status.connected && (
            <form action={disconnectIntegrationAction}>
              <input type="hidden" name="provider" value={provider} />
              <Button type="submit" variant="ghost" size="sm" className="text-danger">
                <Unplug className="h-3.5 w-3.5" aria-hidden />
                Disconnect
              </Button>
            </form>
          )}
        </div>
      </div>

      {editing && (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="provider" value={provider} />
          <div className="grid gap-3 sm:grid-cols-2">
            {needsUrl && (
              <label className="block">
                <span className="field-label">Instance URL</span>
                <input
                  name="baseUrl"
                  type="url"
                  required
                  defaultValue={status.baseUrl ?? ""}
                  placeholder={urlPlaceholder ?? "https://redmine.example.com"}
                  className="field"
                  autoComplete="url"
                />
              </label>
            )}
            <label className={needsUrl ? "block" : "block sm:col-span-2"}>
              <span className="field-label">API key</span>
              <input
                name="secret"
                type="password"
                required
                minLength={12}
                placeholder={secretPlaceholder}
                className="field"
                autoComplete="off"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={pending}>
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {status.connected ? "Save new key" : "Save key"}
            </Button>
            {status.connected && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            )}
            {state.ok && state.message && (
              <span className="flex items-center gap-1.5 text-[12px] text-success">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                {state.message}
              </span>
            )}
            {state.error && <span className="text-[12px] text-danger">{state.error}</span>}
          </div>

          <p className="text-[11.5px] text-muted">{hint}</p>
        </form>
      )}
    </div>
  );
}
