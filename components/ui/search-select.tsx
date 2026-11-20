"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type SearchSelectOption = {
  value: string;
  label: string;
  /** Second line in the list, e.g. the OS of a server. */
  hint?: string;
};

const TRIGGER =
  "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-line-strong bg-surface px-2.5 text-left text-[13px] text-navy outline-none transition-colors hover:bg-[#f7f9fc] focus-visible:border-navy focus-visible:ring-2 focus-visible:ring-navy/10 disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Search dropdown for long lists: server inventory, people, groups.
 *
 * The chosen value travels in a hidden input, so the surrounding `<form>` stays
 * a plain server action. Filtering is local because every list is bounded
 * (200 endpoints, the active staff list, the groups table).
 */
export function SearchSelect({
  name,
  options,
  placeholder,
  emptyLabel,
  ariaLabel,
  defaultValue = "",
  searchPlaceholder = "Search",
}: {
  name: string;
  options: SearchSelectOption[];
  placeholder: string;
  /** Shown when the list is empty — states why there is nothing to pick. */
  emptyLabel?: string;
  ariaLabel: string;
  defaultValue?: string;
  searchPlaceholder?: string;
}) {
  const legacy = defaultValue && !options.some((option) => option.value === defaultValue);

  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // A stored value that is not in the list (a task raised before servers were
  // picked from Action1) stays selectable instead of being silently dropped.
  const withLegacy = useMemo(() => {
    if (legacy && defaultValue) {
      return [{ value: defaultValue, label: defaultValue }, ...options];
    }
    return options;
  }, [legacy, defaultValue, options]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return withLegacy;
    return withLegacy.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        (option.hint ?? "").toLowerCase().includes(needle),
    );
  }, [withLegacy, query]);

  const selected = withLegacy.find((option) => option.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function choose(next: string) {
    setValue(next);
    setOpen(false);
    setQuery("");
    setActive(0);
  }

  const empty = withLegacy.length === 0;
  const disabled = empty;

  return (
    <div className="relative" ref={wrapRef}>
      <input type="hidden" name={name} value={value} />

      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={TRIGGER}
      >
        <span className={selected ? "truncate" : "truncate text-muted"}>
          {selected ? selected.label : empty ? (emptyLabel ?? placeholder) : placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
      </button>

      {open && !disabled && (
        <div className="absolute z-30 mt-1 w-full min-w-[240px] rounded-md border border-line-strong bg-surface shadow-[0_10px_26px_rgba(23,44,82,0.12)]">
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
                  if (pick) choose(pick.value);
                }
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-8 w-full rounded border border-transparent bg-canvas px-2 text-[12.5px] text-navy outline-none placeholder:text-muted focus:border-line-strong"
            />
          </div>

          <ul role="listbox" aria-label={ariaLabel} className="max-h-56 overflow-y-auto py-1">
            {matches.length === 0 && (
              <li className="px-3 py-2 text-[12px] text-muted">No match for “{query}”.</li>
            )}
            {matches.map((option, index) => (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(option.value)}
                  className={
                    index === active
                      ? "flex w-full items-center justify-between gap-2 bg-[#eef2f8] px-3 py-2 text-left text-navy"
                      : "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-body hover:bg-[#f4f7fc]"
                  }
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px]">{option.label}</span>
                    {option.hint && (
                      <span className="block truncate text-[11px] text-muted">{option.hint}</span>
                    )}
                  </span>
                  {option.value === value && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-navy" aria-hidden />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
