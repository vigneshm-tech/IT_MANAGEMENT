"use client";

import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";
import { useActionState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import { createRedmineTicketAction } from "@/app/(app)/modules/tickets/redmine/actions";

/** Inline create form — posts straight to Redmine, no popup. */
export function TicketForm({ projects }: { projects: { id: number; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createRedmineTicketAction, {} as FormState);

  return (
    <form action={formAction} className="border border-line bg-surface">
      <div className="grid grid-cols-1 gap-x-5 gap-y-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <div>
          <label htmlFor="projectId" className="field-label">
            Project<span className="ml-0.5 text-danger">*</span>
          </label>
          <select id="projectId" name="projectId" required defaultValue="" className="field">
            <option value="">Select a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="subject" className="field-label">
            Subject<span className="ml-0.5 text-danger">*</span>
          </label>
          <input
            id="subject"
            name="subject"
            required
            minLength={4}
            maxLength={255}
            placeholder="One line: what is wrong or needed?"
            className="field"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="description" className="field-label">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={6}
            maxLength={8000}
            placeholder="Steps, impact, asset names, what you have already tried"
            className="field resize-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
        <p className="text-[11.5px] text-muted">
          Priority and tracker come from Redmine.
        </p>
        <div className="flex items-center gap-2">
          <Link href="/modules/tickets" className={buttonClass({ variant: "secondary", size: "sm" })}>
            Cancel
          </Link>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Create ticket
          </Button>
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
    </form>
  );
}
