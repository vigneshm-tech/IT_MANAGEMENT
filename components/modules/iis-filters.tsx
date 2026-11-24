"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { APP_STATUSES, DIRECTORY_BROWSING, ENVIRONMENTS, ENVIRONMENT_LABELS } from "@/lib/iis/constants";
import type { ApplicationFilters } from "@/lib/iis/filters";

const STATUS_LABEL: Record<string, string> = {
  running: "Running",
  stopped: "Stopped",
  degraded: "Degraded",
  maintenance: "Maintenance",
};

/**
 * The filter bar, as a plain GET form.
 *
 * No state, no fetch: submitting reloads the page with `?server=WEB01&ssl=mapped`
 * in the URL, which means a narrowed register can be bookmarked, shared with a
 * colleague or pasted into a ticket. Selecting a dropdown submits immediately —
 * a person who picked a server expects the table to answer, not to press Go.
 */
export function IisApplicationFilters({
  filters,
  servers,
  shown,
  total,
}: {
  filters: ApplicationFilters;
  servers: string[];
  shown: number;
  total: number;
}) {
  const active =
    filters.q !== "" ||
    filters.server !== "" ||
    filters.environment !== "" ||
    filters.ssl !== "" ||
    filters.browsing !== "" ||
    filters.state !== "" ||
    filters.active !== "";

  return (
    <form
      action="/modules/iis/applications"
      method="get"
      className="border border-line bg-surface"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2.5 sm:px-4">
        <p className="inline-flex items-center gap-1.5 text-[12px] font-medium text-navy">
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          Filters
        </p>
        <p className="text-[11.5px] text-muted">
          {shown === total ? `${total} applications` : `${shown} of ${total} applications`}
        </p>
        {active && (
          <a
            href="/modules/iis/applications"
            className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-muted transition-colors hover:text-navy"
          >
            <X className="h-3 w-3" aria-hidden />
            Clear
          </a>
        )}
      </div>

      <div className="grid gap-2 px-3 py-3 sm:grid-cols-2 sm:px-4 lg:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Search name, host, certificate, pool or path"
            aria-label="Search applications"
            className="field pl-8 text-[12px]"
          />
        </div>

        <select
          name="server"
          defaultValue={filters.server}
          aria-label="Server"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="field text-[12px]"
        >
          <option value="">All servers</option>
          {servers.map((server) => (
            <option key={server} value={server}>
              {server}
            </option>
          ))}
        </select>

        <select
          name="environment"
          defaultValue={filters.environment}
          aria-label="Environment"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="field text-[12px]"
        >
          <option value="">Any environment</option>
          {ENVIRONMENTS.map((value) => (
            <option key={value} value={value}>
              {ENVIRONMENT_LABELS[value]}
            </option>
          ))}
        </select>

        <select
          name="ssl"
          defaultValue={filters.ssl}
          aria-label="SSL"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="field text-[12px]"
        >
          <option value="">SSL: any</option>
          <option value="mapped">SSL mapped</option>
          <option value="unmapped">No SSL</option>
        </select>

        <select
          name="browsing"
          defaultValue={filters.browsing}
          aria-label="Directory browsing"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="field text-[12px]"
        >
          <option value="">Browsing: any</option>
          {DIRECTORY_BROWSING.map((value) => (
            <option key={value} value={value}>
              Browsing {value}
            </option>
          ))}
        </select>

        <select
          name="state"
          defaultValue={filters.state}
          aria-label="State"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="field text-[12px]"
        >
          <option value="">Any state</option>
          {APP_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABEL[value] ?? value}
            </option>
          ))}
        </select>

        <select
          name="active"
          defaultValue={filters.active}
          aria-label="Lifecycle"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="field text-[12px]"
        >
          <option value="">Live and retired</option>
          <option value="live">Live only</option>
          <option value="retired">Retired only</option>
        </select>

        <button
          type="submit"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-[12px] font-medium text-navy transition-colors hover:bg-[#f2f5fa]"
        >
          <Search className="h-3.5 w-3.5" aria-hidden />
          Apply
        </button>
      </div>
    </form>
  );
}
