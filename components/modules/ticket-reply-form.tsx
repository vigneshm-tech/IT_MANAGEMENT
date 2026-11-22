"use client";

import { AlertCircle, CheckCircle2, Loader2, Lock, Send } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import { replyTicketAction } from "@/app/(app)/modules/tickets/actions";
import type { TicketTextModuleRecord } from "@/lib/records/repository";

/**
 * Reply or note. The two share one box because agents flip between them
 * constantly; the segmented control decides whether the requester sees it.
 */
export function TicketReplyForm({
  ticketId,
  canNote,
  textModules = [],
}: {
  ticketId: string;
  /** Only agents may write internal notes or book time. */
  canNote: boolean;
  /** Masters → Text modules: reuse a reply instead of retyping it. */
  textModules?: TicketTextModuleRecord[];
}) {
  const [state, formAction, pending] = useActionState(replyTicketAction, {} as FormState);
  const [kind, setKind] = useState<"web" | "note">("web");
  const [body, setBody] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setBody("");
    }
  }, [state.ok, state.message]);

  /** Inserts a snippet without throwing away what has been typed already. */
  function insertModule(id: string) {
    const module = textModules.find((item) => item.id === id);
    if (!module) return;
    setBody((current) => (current.trim() ? `${current.trim()}\n\n${module.body}` : module.body));
    formRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
  }

  return (
    <form ref={formRef} action={formAction} className="border border-line bg-surface">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="kind" value={kind} />

      {canNote && (
        <div className="flex flex-wrap items-center gap-1 border-b border-line px-4 py-2.5">
          <button
            type="button"
            onClick={() => setKind("web")}
            aria-pressed={kind === "web"}
            className={
              kind === "web"
                ? "inline-flex items-center gap-1.5 border border-navy bg-navy px-2.5 py-1 text-[11.5px] font-medium text-white"
                : "inline-flex items-center gap-1.5 border border-line bg-surface px-2.5 py-1 text-[11.5px] text-body hover:border-navy/30 hover:text-navy"
            }
          >
            <Send className="h-3 w-3" aria-hidden />
            Reply to requester
          </button>
          <button
            type="button"
            onClick={() => setKind("note")}
            aria-pressed={kind === "note"}
            className={
              kind === "note"
                ? "inline-flex items-center gap-1.5 border border-[#e4d6ae] bg-warning-soft px-2.5 py-1 text-[11.5px] font-medium text-warning"
                : "inline-flex items-center gap-1.5 border border-line bg-surface px-2.5 py-1 text-[11.5px] text-body hover:border-navy/30 hover:text-navy"
            }
          >
            <Lock className="h-3 w-3" aria-hidden />
            Internal note
          </button>
          <span className="ml-1 text-[11px] text-muted">
            {kind === "web"
              ? "Visible to the requester."
              : "Only agents see notes and system entries."}
          </span>
        </div>
      )}

      <div className="px-4 py-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <label htmlFor="textModule" className="text-[11px] text-muted">
            Text module
          </label>
          <select
            id="textModule"
            defaultValue=""
            onChange={(event) => {
              insertModule(event.target.value);
              event.target.value = "";
            }}
            className="field h-7 w-auto max-w-[260px] text-[11.5px]"
          >
            <option value="">Insert a snippet…</option>
            {textModules.map((module) => (
              <option key={module.id} value={module.id}>
                {module.name}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-muted">maintained in Masters</span>
        </div>
        <label htmlFor="body" className="sr-only">
          Message
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={4}
          maxLength={8000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={kind === "web" ? "Write a reply…" : "Notes for the team…"}
          className="field resize-none"
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="mx-4 mb-3 flex items-start gap-2 border border-[#eccfcd] bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p
          role="status"
          className="mx-4 mb-3 flex items-start gap-2 border border-[#cfe4d4] bg-success-soft px-3 py-2 text-[12.5px] text-success"
        >
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line px-4 py-3">
        {canNote ? (
          <div>
            <label htmlFor="timeMinutes" className="field-label">
              Time spent (minutes)
            </label>
            <input
              id="timeMinutes"
              name="timeMinutes"
              type="number"
              min={0}
              max={1440}
              step={5}
              defaultValue={0}
              className="field w-28"
            />
          </div>
        ) : (
          <p className="text-[11.5px] text-muted">Booking time is for agents.</p>
        )}
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {kind === "note" ? "Add note" : "Send reply"}
        </Button>
      </div>
    </form>
  );
}
