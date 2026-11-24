"use client";

import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import type { RoleOption } from "@/lib/roles/types";
import type { UserGroup } from "@/lib/users/groups";
import { createUserAction } from "@/app/(app)/modules/users/actions";

const inputClass =
  "h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-[13px] text-navy outline-none transition-colors placeholder:text-muted focus:border-navy focus:ring-2 focus:ring-navy/10";

/**
 * `plain` keeps the caption outside a `<label>` — used for the group picker,
 * whose trigger is a button with its own accessible name.
 */
function Field({
  label,
  required,
  hint,
  plain,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  plain?: boolean;
  children: React.ReactNode;
}) {
  const Wrapper = plain ? "div" : "label";

  return (
    <Wrapper className="block">
      <span className="mb-1 block text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </Wrapper>
  );
}

/**
 * Searchable group picker. The chosen id is submitted through a hidden input,
 * so the form stays a plain server action.
 */
function GroupPicker({ groups }: { groups: Pick<UserGroup, "id" | "name">[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [value, setValue] = useState("");
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups;
    return groups.filter((group) => group.name.toLowerCase().includes(needle));
  }, [groups, query]);

  const selected = groups.find((group) => group.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function choose(id: string) {
    setValue(id);
    setOpen(false);
    setQuery("");
    setActive(0);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <input type="hidden" name="groupId" value={value} />

      <button
        type="button"
        aria-label="Access group"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-line-strong bg-surface px-2.5 text-left text-[13px] text-navy outline-none transition-colors hover:bg-[#f7f9fc] focus-visible:border-navy focus-visible:ring-2 focus-visible:ring-navy/10"
      >
        <span className={selected ? "truncate" : "truncate text-muted"}>
          {selected ? selected.name : groups.length === 0 ? "No groups available" : "Select a group"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
      </button>

      {open && groups.length > 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-line-strong bg-surface shadow-[0_10px_26px_rgba(23,44,82,0.12)]">
          <div className="border-b border-line p-1.5">
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setOpen(false);
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((current) => Math.min(current + 1, matches.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((current) => Math.max(current - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const pick = matches[active];
                  if (pick) choose(pick.id);
                }
              }}
              placeholder="Search groups"
              aria-label="Search groups"
              className="h-8 w-full rounded border border-transparent bg-canvas px-2 text-[12.5px] text-navy outline-none placeholder:text-muted focus:border-line-strong"
            />
          </div>

          <ul role="listbox" aria-label="Groups" className="max-h-56 overflow-y-auto py-1">
            {matches.length === 0 && (
              <li className="px-3 py-2 text-[12px] text-muted">No group matches “{query}”.</li>
            )}
            {matches.map((group, index) => (
              <li key={group.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={group.id === value}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(group.id)}
                  className={
                    index === active
                      ? "flex w-full items-center justify-between gap-2 bg-[#eef2f8] px-3 py-2 text-left text-[12.5px] text-navy"
                      : "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12.5px] text-body hover:bg-[#f4f7fc]"
                  }
                >
                  <span className="truncate">{group.name}</span>
                  {group.id === value && <Check className="h-3.5 w-3.5 text-navy" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Inline add-user panel — seven fields, no dialog. */
export function UserForm({
  groups,
  roles,
  onClose,
}: {
  groups: Pick<UserGroup, "id" | "name">[];
  /** Every role a person may be given, including ones this workspace defined. */
  roles: RoleOption[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(createUserAction, {});

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  return (
    <form action={formAction} className="border border-line bg-surface">
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Employee name" required>
          <input
            name="fullName"
            required
            autoComplete="name"
            placeholder="Priya Raman"
            className={inputClass}
          />
        </Field>

        <Field label="Employee ID" required>
          <input name="employeeId" required placeholder="EMP-1042" className={inputClass} />
        </Field>

        <Field label="Employee designation" required>
          <input
            name="designation"
            required
            placeholder="IT Support Engineer"
            className={inputClass}
          />
        </Field>

        <Field label="Work email" required>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="priya.raman@company.com"
            className={inputClass}
          />
        </Field>

        <Field label="Access level" required>
          <select name="role" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Select an access level
            </option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Access group" required plain>
          <GroupPicker groups={groups} />
          {groups.length === 0 && (
            <span className="mt-1 block text-[11px] text-muted">
              No groups yet — create one in{" "}
              <Link href="/modules/users/groups" className="font-medium text-navy hover:underline">
                Manage Groups
              </Link>
              .
            </span>
          )}
        </Field>

        <Field label="Temporary password" required hint="At least 8 characters.">
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="••••••••"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <button type="submit" disabled={pending} className={buttonClass({ size: "sm" })}>
          {pending ? "Adding…" : "Add user"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className={buttonClass({ variant: "ghost", size: "sm" })}
        >
          Cancel
        </button>
        {state.error && <span className="text-[12px] text-danger">{state.error}</span>}
        {state.ok && state.message && (
          <span className="text-[12px] text-success">{state.message}</span>
        )}
      </div>
    </form>
  );
}
