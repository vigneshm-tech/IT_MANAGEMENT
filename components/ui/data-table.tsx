"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  Rows2,
  Rows3,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { StatusPill, humanise } from "./status-pill";
import {
  defaultPrefs,
  normalisePrefs,
  PAGE_SIZES,
  reconcilePrefs,
  STORAGE_PREFIX,
  toCsv,
  type TablePrefs,
} from "@/lib/table-prefs";

export type Column = {
  key: string;
  label: string;
  /** Rendering hint only — all values stay serializable. */
  type?: "text" | "status" | "muted" | "mono" | "money";
  align?: "left" | "right";
  width?: string;
};

export type TableRowData = {
  id: string;
  cells: Record<string, string | number | null>;
  /** When set, the first cell becomes a link. Opens in a new tab by default. */
  href?: string;
  /** `_self` keeps the reader in the module — used where the row is the page. */
  hrefTarget?: "_blank" | "_self";
  /** Overrides the table-level actions for this row. */
  actions?: RowAction[];
};

/** Back-compat alias: `TableRow` now names the shadcn primitive. */
export type TableRow = TableRowData;

export type RowAction = {
  label: string;
  /** Only needed for form-posted actions; links use `href` instead. */
  value?: string;
  tone?: "default" | "primary" | "danger";
  confirm?: string;
  /** Navigates instead of posting — used for Edit and designed confirms. */
  href?: string;
};

/** Reads this browser's saved preferences; failures simply mean "defaults". */
function readPrefs(key: string): Partial<TablePrefs> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TablePrefs>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function DataTable({
  columns,
  rows,
  rowAction,
  rowActions,
  rowExtras,
  renderRowExtras,
  searchPlaceholder = "Search",
  emptyState,
  pageSize = 8,
  tableId,
  defaultHidden = [],
  exportName,
  footer,
}: {
  columns: Column[];
  rows: TableRowData[];
  rowAction?: (formData: FormData) => Promise<void>;
  rowActions?: RowAction[];
  /**
   * Ready-rendered controls keyed by row id. Server components can pass client
   * elements here — unlike a render prop, which cannot cross the RSC boundary.
   */
  rowExtras?: Record<string, ReactNode>;
  /** Extra client-side controls rendered in the actions cell, before the form buttons. */
  renderRowExtras?: (row: TableRowData) => ReactNode;
  searchPlaceholder?: string;
  emptyState: ReactNode;
  pageSize?: number;
  /** Stable key for remembered column/row preferences. Defaults to the column keys. */
  tableId?: string;
  /** Columns hidden until the operator turns them on. */
  defaultHidden?: string[];
  /** File name (without extension) for the CSV export. */
  exportName?: string;
  /** Anything to render inside the footer bar, before the pager. */
  footer?: ReactNode;
}) {
  const storageKey =
    STORAGE_PREFIX + (tableId ?? columns.map((column) => column.key).join("-"));

  // Rebuilt cheaply on render — the identity must never drive the effects below.
  const buildDefaults = (): TablePrefs =>
    defaultPrefs(
      columns.map((column) => column.key),
      defaultHidden,
      pageSize,
    );

  const defaults = buildDefaults();
  const defaultsSignature = `${defaults.order.join("|")}::${defaults.hidden.join("|")}::${defaults.pageSize}`;

  const [prefs, setPrefs] = useState<TablePrefs>(defaults);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [columnsOpen, setColumnsOpen] = useState(false);

  // Read stored preferences after mount so the server HTML stays deterministic.
  // Guarded by a signature ref: running on every render is harmless, but a
  // dependency array would loop on the freshly built defaults object.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    const signature = `${storageKey}::${defaultsSignature}`;
    if (loadedFor.current === signature) return;
    loadedFor.current = signature;
    const stored = readPrefs(storageKey);
    setPrefs(
      reconcilePrefs(
        normalisePrefs(stored, buildDefaults()),
        columns.map((column) => column.key),
      ),
    );
    setHydrated(true);
  });

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(prefs));
    } catch {
      /* private mode — the table simply forgets */
    }
  }, [prefs, hydrated, storageKey]);

  // The settings panel is inline, so it only needs Escape to close.
  useEffect(() => {
    if (!columnsOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setColumnsOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [columnsOpen]);

  const orderedColumns = useMemo(() => {
    const byKey = new Map(columns.map((column) => [column.key, column]));
    return prefs.order
      .map((key) => byKey.get(key))
      .filter((column): column is Column => Boolean(column));
  }, [columns, prefs.order]);

  const visibleColumns = orderedColumns.filter(
    (column) => !prefs.hidden.includes(column.key),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    // Every column is searched, visible or not, so hiding a column never
    // silently changes what the search can find.
    return rows.filter((row) =>
      Object.values(row.cells).some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [rows, query]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const column = columns.find((c) => c.key === sortKey);
    const copy = [...filtered];
    copy.sort((a, b) => {
      const left = a.cells[sortKey];
      const right = b.cells[sortKey];
      if (column?.type === "money") {
        return (Number(left) || 0) - (Number(right) || 0);
      }
      return String(left ?? "").localeCompare(String(right ?? ""), "en", { numeric: true });
    });
    return sortDir === "asc" ? copy : copy.reverse();
  }, [filtered, sortKey, sortDir, columns]);

  const perPage = prefs.pageSize;
  const pageCount = perPage === 0 ? 1 : Math.max(1, Math.ceil(sorted.length / perPage));
  const currentPage = Math.min(page, pageCount - 1);
  const start = perPage === 0 ? 0 : currentPage * perPage;
  const visible = perPage === 0 ? sorted : sorted.slice(start, start + perPage);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  function toggleColumn(key: string) {
    setPrefs((current) => {
      const hidden = current.hidden.includes(key)
        ? current.hidden.filter((item) => item !== key)
        : [...current.hidden, key];
      // Never hide every column.
      if (current.order.every((item) => hidden.includes(item))) return current;
      return { ...current, hidden };
    });
  }

  function moveColumn(key: string, direction: -1 | 1) {
    setPrefs((current) => {
      const order = [...current.order];
      const index = order.indexOf(key);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= order.length) return current;
      [order[index], order[next]] = [order[next], order[index]];
      return { ...current, order };
    });
  }

  function resetPrefs() {
    setPrefs(defaults);
    setPage(0);
    setSortKey(null);
  }

  function exportCsv() {
    const csv = toCsv(
      visibleColumns.map((column) => column.label),
      sorted.map((row) =>
        visibleColumns.map((column) => String(row.cells[column.key] ?? "")),
      ),
    );
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${exportName ?? tableId ?? "table"}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const showsActions = Boolean(
    renderRowExtras ||
      rowExtras ||
      (rowAction && (rowActions?.length || rows.some((row) => row.actions?.length))) ||
      rows.some((row) => row.actions?.some((action) => action.href)),
  );

  const customised =
    prefs.hidden.length > 0 ||
    prefs.density === "compact" ||
    prefs.pageSize !== pageSize ||
    prefs.order.join("|") !== defaults.order.join("|");

  if (rows.length === 0) {
    return <div>{emptyState}</div>;
  }

  const toolbarButton =
    "inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 text-[12px] text-body transition-colors hover:border-navy/30 hover:text-navy";

  return (
    <div className="border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <p className="text-[12px] text-muted">
          {filtered.length} {filtered.length === 1 ? "record" : "records"}
          {query.trim() && filtered.length !== rows.length && (
            <span className="text-[#9aa5b8]"> of {rows.length}</span>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-8 w-[190px] rounded-md border border-line-strong bg-surface pl-8 pr-2.5 text-[12.5px] text-navy placeholder:text-[#9aa5b8] focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
            />
          </div>

          <button
            type="button"
            onClick={() => setColumnsOpen((open) => !open)}
            aria-expanded={columnsOpen}
            aria-controls="table-columns-panel"
            className={cn(toolbarButton, customised && "border-navy/30 text-navy")}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            Columns
            {customised && (
              <span className="rounded-full bg-[#eef2f9] px-1.5 text-[10.5px] font-medium text-navy tabular-nums">
                {visibleColumns.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() =>
              setPrefs((current) => ({
                ...current,
                density: current.density === "compact" ? "comfortable" : "compact",
              }))
            }
            aria-label="Toggle row density"
            title={prefs.density === "compact" ? "Comfortable rows" : "Compact rows"}
            aria-pressed={prefs.density === "compact"}
            className={cn(toolbarButton, "px-2")}
          >
            {prefs.density === "compact" ? (
              <Rows2 className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Rows3 className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>

          <button
            type="button"
            onClick={exportCsv}
            className={toolbarButton}
            title="Download the filtered rows as CSV"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export
          </button>
        </div>
      </div>

      {columnsOpen && (
        <div
          id="table-columns-panel"
          className="border-b border-line bg-[#fbfcfe] px-4 py-3"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
              Columns &amp; order
            </p>
            <button
              type="button"
              onClick={() => setColumnsOpen(false)}
              aria-label="Close column settings"
              className="rounded p-1 text-muted transition-colors hover:bg-[#eef2f8] hover:text-navy"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
            {orderedColumns.map((column, index) => {
              const checked = !prefs.hidden.includes(column.key);
              return (
                <li
                  key={column.key}
                  className="flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-[#f2f6fc]"
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => toggleColumn(column.key)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left text-[12.5px] text-body"
                  >
                    <span
                      className={cn(
                        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                        checked ? "border-navy bg-navy text-white" : "border-line-strong bg-surface",
                      )}
                      aria-hidden
                    >
                      {checked && <Check className="h-2.5 w-2.5" />}
                    </span>
                    <span className="truncate">{column.label}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => moveColumn(column.key, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${column.label} earlier`}
                    className="rounded p-1 text-muted transition-colors hover:bg-[#eef2f8] hover:text-navy disabled:opacity-30"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveColumn(column.key, 1)}
                    disabled={index === orderedColumns.length - 1}
                    aria-label={`Move ${column.label} later`}
                    className="rounded p-1 text-muted transition-colors hover:bg-[#eef2f8] hover:text-navy disabled:opacity-30"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
            <button
              type="button"
              onClick={() =>
                setPrefs((current) => ({
                  ...current,
                  density: current.density === "compact" ? "comfortable" : "compact",
                }))
              }
              className="inline-flex items-center gap-1.5 rounded px-1.5 py-1 text-[11.5px] text-body transition-colors hover:bg-[#eef2f8] hover:text-navy"
            >
              {prefs.density === "compact" ? (
                <Rows2 className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Rows3 className="h-3.5 w-3.5" aria-hidden />
              )}
              {prefs.density === "compact" ? "Compact rows" : "Comfortable rows"}
            </button>

            <button
              type="button"
              onClick={resetPrefs}
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11.5px] text-muted transition-colors hover:bg-[#eef2f8] hover:text-danger"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              Reset to defaults
            </button>
          </div>
        </div>
      )}

      <Table
        className="min-w-[760px] border-collapse"
        data-density={prefs.density}
      >
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {visibleColumns.map((column) => (
              <TableHead
                key={column.key}
                scope="col"
                style={{ width: column.width }}
                aria-sort={
                  sortKey === column.key
                    ? sortDir === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                className={cn(column.align === "right" && "text-right")}
              >
                <button
                  type="button"
                  onClick={() => toggleSort(column.key)}
                  className={cn(
                    "inline-flex items-center gap-1 transition hover:text-navy",
                    column.align === "right" && "flex-row-reverse",
                  )}
                >
                  {column.label}
                  {sortKey === column.key &&
                    (sortDir === "asc" ? (
                      <ArrowUp className="h-3 w-3" aria-hidden />
                    ) : (
                      <ArrowDown className="h-3 w-3" aria-hidden />
                    ))}
                </button>
              </TableHead>
            ))}
            {showsActions && (
              <TableHead scope="col" className="text-right">
                Actions
              </TableHead>
            )}
          </TableRow>
        </TableHeader>

        <TableBody>
          {visible.map((row) => (
            <TableRow key={row.id}>
              {visibleColumns.map((column, index) => {
                const value = row.cells[column.key];
                const isFirst = index === 0;
                return (
                  <TableCell
                    key={column.key}
                    className={cn(column.align === "right" && "text-right")}
                  >
                    {column.type === "status" ? (
                      <StatusPill status={String(value ?? "")} label={humanise(String(value ?? ""))} />
                    ) : isFirst && row.href ? (
                      <a
                        href={row.href}
                        target={row.hrefTarget ?? "_blank"}
                        rel="noreferrer"
                        className="font-medium text-navy underline-offset-2 transition-colors hover:text-gold hover:underline"
                      >
                        {value ?? "—"}
                      </a>
                    ) : (
                      <span
                        className={cn(
                          column.type === "muted" && "text-muted",
                          column.type === "mono" && "font-mono text-[12px] text-muted",
                          column.type === "money" && "tabular-nums",
                          isFirst ? "font-medium text-navy" : "text-body",
                        )}
                      >
                        {value ?? "—"}
                      </span>
                    )}
                    {isFirst && column.type !== "status" && (
                      <span className="sr-only">, {row.id}</span>
                    )}
                  </TableCell>
                );
              })}

              {showsActions && (
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-1">
                    {rowExtras?.[row.id]}
                    {renderRowExtras?.(row)}
                    {rowAction && (
                      <form id={`row-actions-${row.id}`} action={rowAction} className="contents">
                        <input type="hidden" name="id" value={row.id} />
                      </form>
                    )}
                    {(row.actions ?? rowActions ?? []).map((action) =>
                      action.href ? (
                        <Link
                          key={action.label}
                          href={action.href}
                          className={cn(
                            "rounded px-2 py-1 text-[11.5px] font-medium transition-colors",
                            action.tone === "primary" && "text-navy hover:bg-[#eef2f8]",
                            action.tone === "danger" && "text-danger hover:bg-danger-soft",
                            (!action.tone || action.tone === "default") &&
                              "text-muted hover:bg-[#eef2f8] hover:text-navy",
                          )}
                        >
                          {action.label}
                        </Link>
                      ) : (
                        <button
                          key={action.value ?? action.label}
                          type="submit"
                          form={`row-actions-${row.id}`}
                          name="value"
                          value={action.value}
                          onClick={(event) => {
                            if (action.confirm && !window.confirm(action.confirm)) {
                              event.preventDefault();
                            }
                          }}
                          className={cn(
                            "rounded px-2 py-1 text-[11.5px] font-medium transition-colors",
                            action.tone === "primary" && "text-navy hover:bg-[#eef2f8]",
                            action.tone === "danger" && "text-danger hover:bg-danger-soft",
                            (!action.tone || action.tone === "default") &&
                              "text-muted hover:bg-[#eef2f8] hover:text-navy",
                          )}
                        >
                          {action.label}
                        </button>
                      ),
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-[12px] text-muted">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            {sorted.length === 0
              ? "0 records"
              : perPage === 0
                ? `All ${sorted.length} records`
                : `${start + 1}–${Math.min(start + perPage, sorted.length)} of ${sorted.length}`}
          </span>

          {footer}

          <label className="flex items-center gap-1.5">
            <span className="text-[11.5px] text-muted">Rows</span>
            <span className="relative">
              <select
                value={prefs.pageSize}
                onChange={(event) => {
                  setPrefs((current) => ({ ...current, pageSize: Number(event.target.value) }));
                  setPage(0);
                }}
                aria-label="Rows per page"
                className="h-7 appearance-none rounded border border-line-strong bg-surface pl-2 pr-6 text-[11.5px] text-navy focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size === 0 ? "All" : size}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted"
                aria-hidden
              />
            </span>
          </label>
        </div>

        {perPage !== 0 && pageCount > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              aria-label="Previous page"
              className="rounded p-1 transition hover:bg-[#eef2f8] disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-1 tabular-nums">
              {currentPage + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={currentPage >= pageCount - 1}
              aria-label="Next page"
              className="rounded p-1 transition hover:bg-[#eef2f8] disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
