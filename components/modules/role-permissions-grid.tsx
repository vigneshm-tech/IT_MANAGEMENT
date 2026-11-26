"use client";

import { AlertCircle, CheckCircle2, ChevronDown, Loader2, Save } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import type { ModuleId } from "@/lib/modules";
import type { AccessLevel } from "@/lib/roles/permissions";
import { pageKey, type PageOverride, type SubPage } from "@/lib/roles/pages";

export type GridModule = {
  id: ModuleId;
  title: string;
  groupLabel: string;
  level: AccessLevel;
  pages: SubPage[];
  /** Page overrides this role already carries. */
  pageOverrides: Record<string, PageOverride>;
};

export type GridGroup = { id: string; label: string; modules: GridModule[] };

/**
 * A select whose value is always readable.
 *
 * A native `<select>` paints its own value text on several platforms, which is
 * how a perfectly legible stylesheet can still produce a pale grey "Write". So
 * the appearance is removed, the chevron is drawn here, and the colour is stated
 * outright: navy at full strength, and a readable body tone when disabled rather
 * than a faded one.
 */
function GridSelect({
  name,
  value,
  disabled,
  label,
  options,
  wide = false,
}: {
  name: string;
  value: string;
  disabled?: boolean;
  label: string;
  options: { value: string; label: string }[];
  wide?: boolean;
}) {
  return (
    <span className={wide ? "relative inline-block w-44" : "relative block w-full"}>
      <select
        name={name}
        defaultValue={value}
        disabled={disabled}
        aria-label={label}
        className="field h-8 w-full cursor-pointer appearance-none py-0 pl-2.5 pr-7 text-[13px] font-medium text-navy disabled:cursor-default disabled:bg-[#eef1f6] disabled:text-body"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-navy-soft"
        aria-hidden
      />
    </span>
  );
}

/**
 * Access and permission, as two fields.
 *
 * *Access* is whether the module is theirs at all — off means it disappears from
 * their navigation and its pages refuse them. *Permission* is what they may do
 * once inside: read, or read and change. Keeping them apart is the point: an
 * auditor needs a module without ever needing to change it.
 *
 * Inside each module, its pages are listed. Each one follows the module unless
 * an administrator says otherwise, and a page can only narrow the module — a
 * closed page is closed even when the module is open.
 */
export function RolePermissionsGrid({
  roleId,
  groups,
  action,
  readOnly = false,
}: {
  roleId: string;
  groups: GridGroup[];
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  readOnly?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    // A module with a closed page starts expanded, so nothing hidden stays unseen.
    const initial: Record<string, boolean> = {};
    for (const group of groups) {
      for (const module of group.modules) {
        const closed = Object.values(module.pageOverrides).some((value) => value === "none");
        if (closed) initial[module.id] = true;
      }
    }
    return initial;
  });

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={roleId} />

      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 border border-[#f0d5d5] bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p className="flex items-center gap-2 border border-[#cfe3d2] bg-success-soft px-3 py-2 text-[12.5px] text-success">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {state.message}
        </p>
      )}

      <div className="border border-line bg-surface">
        <div className="grid grid-cols-[1fr_88px_132px] items-center gap-2 border-b border-line bg-[#f7f9fc] px-4 py-2 text-[10.5px] uppercase tracking-[0.09em] text-muted sm:grid-cols-[1fr_96px_148px_28px] sm:px-5">
          <span className="font-medium">Module</span>
          <span className="text-center font-medium">Access</span>
          <span className="text-center font-medium">Permission</span>
          <span className="hidden sm:block" aria-hidden />
        </div>

        {groups.map((group) => (
          <div key={group.id}>
            <p className="border-y border-line bg-[#f4f7fc] px-4 py-1.5 text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted sm:px-5">
              {group.label}
            </p>
            {group.modules.map((module) => {
              const accessible = module.level !== "none";
              const expanded = open[module.id] === true;
              const closedPages = module.pages.filter(
                (page) => module.pageOverrides[pageKey(module.id, page.id)] === "none",
              ).length;

              return (
                <div key={module.id} className="border-b border-line last:border-0">
                  <div className="grid grid-cols-[1fr_88px_132px] items-center gap-2 px-4 py-2.5 sm:grid-cols-[1fr_96px_148px_28px] sm:px-5">
                    <div className="min-w-0">
                      <span className="block text-[12.5px] font-medium text-navy">
                        {module.title}
                      </span>
                      {module.pages.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setOpen((current) => ({ ...current, [module.id]: !expanded }))
                          }
                          aria-expanded={expanded}
                          className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-navy"
                        >
                          <ChevronDown
                            className={`h-3 w-3 transition-transform ${expanded ? "" : "-rotate-90"}`}
                            aria-hidden
                          />
                          {module.pages.length} pages
                          {closedPages > 0 ? ` · ${closedPages} closed` : ""}
                        </button>
                      )}
                    </div>

                    <div className="flex justify-center">
                      <label className="inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          name={`access:${module.id}`}
                          defaultChecked={accessible}
                          disabled={readOnly}
                          className="peer sr-only"
                          aria-label={`${module.title}: access`}
                        />
                        <span className="relative h-5 w-9 rounded-full border border-line-strong bg-[#e8edf5] transition-colors peer-checked:border-navy peer-checked:bg-navy peer-focus-visible:ring-2 peer-focus-visible:ring-gold/70 peer-disabled:opacity-50">
                          <span className="absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
                        </span>
                      </label>
                    </div>

                    <div className="flex justify-center">
                      <GridSelect
                        name={`perm:${module.id}`}
                        value={module.level === "write" ? "write" : "read"}
                        disabled={readOnly || !accessible}
                        label={`${module.title}: permission`}
                        options={[
                          { value: "read", label: "Read only" },
                          { value: "write", label: "Write" },
                        ]}
                      />
                    </div>

                    <span className="hidden sm:block" aria-hidden />
                  </div>

                  {/*
                    Always rendered, hidden only visually: a collapsed module
                    must still submit its page answers, or saving the form would
                    quietly reopen a page somebody closed.
                  */}
                  {module.pages.length > 0 && (
                    <ul
                      className={
                        expanded
                          ? "border-t border-dashed border-line bg-[#fbfcfe] px-4 py-2 sm:px-5"
                          : "hidden"
                      }
                    >
                      {module.pages.map((page) => (
                        <li
                          key={page.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                        >
                          <span className="text-[12px] text-body">{page.label}</span>
                          <GridSelect
                            name={`page:${module.id}:${page.id}`}
                            value={module.pageOverrides[pageKey(module.id, page.id)] ?? "inherit"}
                            disabled={readOnly || !accessible}
                            label={`${module.title} → ${page.label}`}
                            wide
                            options={[
                              { value: "inherit", label: "Same as module" },
                              { value: "allow", label: "Allowed" },
                              { value: "none", label: "Not allowed" },
                            ]}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11.5px] text-muted">
            Access opens the module. A page set to <em>Not allowed</em> stays closed even then.
          </p>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="h-3.5 w-3.5" aria-hidden />
            )}
            {pending ? "Saving…" : "Save permissions"}
          </Button>
        </div>
      )}
    </form>
  );
}
