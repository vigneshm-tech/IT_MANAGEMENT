"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import {
  COUNTRIES,
  countryByIso,
  countryFlag,
  searchCountries,
  type Country,
} from "@/lib/countries";
import { cn } from "@/lib/utils";

/**
 * Searchable country-code picker for the contact mobiles.
 *
 * A field that opens a listbox with a search box — not a browser `<select>`
 * (230 entries, and it must be searchable) and not a modal. The submitted value
 * is the ISO code; the visible label is the dial code, e.g. "+91".
 */
export function CountryCodeField({
  id,
  name,
  label,
  defaultValue = "IN",
  describedBy,
  invalid,
}: {
  id: string;
  /** Form field name — submits the ISO code, e.g. "IN". */
  name: string;
  label: string;
  defaultValue?: string;
  describedBy?: string;
  invalid?: boolean;
}) {
  const [value, setValue] = useState(() => countryByIso(defaultValue)?.iso ?? "IN");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = countryByIso(value) ?? COUNTRIES[0];
  const results = useMemo(() => searchCountries(query), [query]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    search.current?.focus();
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function choose(country: Country) {
    setValue(country.iso);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative" ref={wrapper}>
      <input type="hidden" name={name} value={value} />

      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-describedby={describedBy}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "field flex items-center justify-between gap-1.5 text-left",
          invalid && "border-danger",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden>{countryFlag(selected.iso)}</span>
          <span className="truncate font-medium tabular-nums text-navy">{selected.dial}</span>
          <span className="sr-only">{selected.name}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-[280px] max-w-[80vw] border border-line-strong bg-surface">
          <div className="relative border-b border-line">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              ref={search}
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setOpen(false);
                  return;
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((current) => Math.min(current + 1, results.length - 1));
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((current) => Math.max(current - 1, 0));
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  const country = results[active];
                  if (country) choose(country);
                }
              }}
              placeholder="Search country or code"
              aria-label={`Search country codes for ${label}`}
              className="w-full bg-transparent py-2 pl-8 pr-2.5 text-[12.5px] text-navy outline-none placeholder:text-[#9aa5b8]"
            />
          </div>

          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className="max-h-56 overflow-y-auto py-1"
          >
            {results.length === 0 ? (
              <li className="px-3 py-2 text-[12px] text-muted">No country matches that search.</li>
            ) : (
              results.map((country, index) => {
                const current = country.iso === value;
                return (
                  <li key={country.iso}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={current}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => choose(country)}
                      className={cn(
                        "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] transition-colors",
                        index === active ? "bg-[#eef2f8] text-navy" : "text-body",
                      )}
                    >
                      <span aria-hidden>{countryFlag(country.iso)}</span>
                      <span className="min-w-0 flex-1 truncate">{country.name}</span>
                      <span className="tabular-nums text-muted">{country.dial}</span>
                      {current && <Check className="h-3 w-3 text-gold" aria-hidden />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
