"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type MultiSelectOption = {
  value: string;
  label: string;
  hint?: string;
};

const TRIGGER =
  "flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-left text-[13px] text-navy outline-none transition-colors hover:bg-[#f7f9fc] focus-visible:border-navy focus-visible:ring-2 focus-visible:ring-navy/10";

/**
 * Checkbox list in a dropdown, for "select several people" fields.
 *
 * Every chosen value is posted as its own hidden input under the same name, so
 * the surrounding `<form>` stays a plain server action and the action reads
 * `formData.getAll(name)`.
 */
export function MultiSelect({
  name,
  options,
  placeholder,
  emptyLabel,
  ariaLabel,
  defaultValues = [],
  searchPlaceholder = "Search",
}: {
  name: string;
  options: MultiSelectOption[];
  placeholder: string;
  /** Shown when the list has nothing to pick. */
  emptyLabel?: string;
  ariaLabel: string;
  defaultValues?: string[];
  searchPlaceholder?: string;
}) {
  const [values, setValues] = useState<string[]>(defaultValues);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        (option.hint ?? "").toLowerCase().includes(needle),
    );
  }, [options, query]);

  const chosen = values
    .map((value) => options.find((option) => option.value === value))
    .filter((option): option is MultiSelectOption => Boolean(option));

  function toggle(value: string) {
    setValues((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      {values.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}

      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={TRIGGER}
      >
        <span className="flex flex-1 flex-wrap items-center gap-1">
          {chosen.length === 0 ? (
            <span className="text-muted">{options.length === 0 ? (emptyLabel ?? placeholder) : placeholder}</span>
          ) : (
            chosen.map((option) => (
              <span
                key={option.value}
                className="inline-flex items-center gap-1 rounded bg-[#eef2f8] px-1.5 py-0.5 text-[11.5px] font-medium text-navy"
              >
                {option.label}
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`Remove ${option.label}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggle(option.value);
                  }}
                  className="cursor-pointer text-muted hover:text-danger"
                >
                  <X className="h-3 w-3" aria-hidden />
                </span>
              </span>
            ))
          )}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 rounded-md border border-line-strong bg-surface shadow-[0_12px_28px_rgba(23,44,82,0.12)]">
          <div className="border-b border-line p-1.5">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={`${ariaLabel} search`}
              className="h-8 w-full rounded border border-line-strong bg-surface px-2 text-[12.5px] text-navy outline-none focus-visible:border-navy"
            />
          </div>
          <ul role="listbox" aria-multiselectable="true" className="max-h-60 overflow-y-auto py-1">
            {matches.length === 0 && (
              <li className="px-2.5 py-2 text-[12.5px] text-muted">
                {options.length === 0 ? (emptyLabel ?? "Nothing to pick") : "No match"}
              </li>
            )}
            {matches.map((option) => {
              const checked = values.includes(option.value);
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(option.value)}
                    className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left hover:bg-[#f2f5fa]"
                  >
                    <span
                      aria-hidden
                      className={
                        checked
                          ? "mt-0.5 flex h-3.5 w-3.5 items-center justify-center rounded border border-navy bg-navy text-white"
                          : "mt-0.5 h-3.5 w-3.5 rounded border border-line-strong bg-surface"
                      }
                    >
                      {checked && <Check className="h-2.5 w-2.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-navy">{option.label}</span>
                      {option.hint && (
                        <span className="block truncate text-[11.5px] text-muted">{option.hint}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
