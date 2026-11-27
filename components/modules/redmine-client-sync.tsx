"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useActionState } from "react";
import {
  syncRedmineClientsAction,
  type ClientSyncState,
} from "@/app/(app)/modules/tickets/redmine/clients/actions";
import { Button } from "@/components/ui/button";

const initial: ClientSyncState = {};

/**
 * Sync now.
 *
 * A plain form post, so it works without JavaScript; `useActionState` only adds
 * the spinner and the sentence that comes back. The result sits under the
 * button rather than on the page, because the answer belongs to the click.
 */
export function RedmineClientSync({
  label = "Sync now",
  variant = "secondary",
}: {
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const [state, action, pending] = useActionState(syncRedmineClientsAction, initial);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <form action={action}>
        <Button
          type="submit"
          variant={variant}
          size="sm"
          disabled={pending}
          title="Read the client field on every ticket in Redmine and store the list"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          )}
          {pending ? "Syncing…" : label}
        </Button>
      </form>

      {state.error && (
        <span className="max-w-[300px] text-right text-[11.5px] leading-snug text-danger">
          {state.error}
        </span>
      )}
      {state.ok && state.message && (
        <span className="max-w-[300px] text-right text-[11.5px] leading-snug text-success">
          {state.message}
        </span>
      )}
    </div>
  );
}
