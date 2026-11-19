"use client";

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
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
  /** Overrides the table-level actions for this row. */
  actions?: RowAction[];
};

/** Back-compat alias: `TableRow` now names the shadcn primitive. */
export type TableRow = TableRowData;

export type RowAction = {
  label: string;
  value: string;
  tone?: "default" | "primary" | "danger";
  confirm?: string;
};

export function DataTable({
  columns,
  rows,
  rowAction,
  rowActions,
  searchPlaceholder = "Search",
  emptyState,
  pageSize = 8,
}: {
  columns: Column[];
  rows: TableRowData[];
  rowAction?: (formData: FormData) => Promise<void>;
  rowActions?: RowAction[];
  searchPlaceholder?: string;
  emptyState: ReactNode;
  pageSize?: number;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
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

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * pageSize;
  const visible = sorted.slice(start, start + pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  const showsActions = Boolean(
    rowAction && (rowActions?.length || rows.some((row) => row.actions?.length)),
  );

  if (rows.length === 0) {
    return <div>{emptyState}</div>;
  }

  return (
    <div className="border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <p className="text-[12px] text-muted">
          {filtered.length} {filtered.length === 1 ? "record" : "records"}
        </p>
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
            className="h-8 w-[200px] rounded-md border border-line-strong bg-surface pl-8 pr-2.5 text-[12.5px] text-navy placeholder:text-[#9aa5b8] focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
          />
        </div>
      </div>

      <Table className="min-w-[760px] border-collapse">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead
                key={column.key}
                scope="col"
                style={{ width: column.width }}
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
              {columns.map((column, index) => {
                const value = row.cells[column.key];
                const isFirst = index === 0;
                return (
                  <TableCell
                    key={column.key}
                    className={cn(column.align === "right" && "text-right")}
                  >
                    {column.type === "status" ? (
                      <StatusPill status={String(value ?? "")} label={humanise(String(value ?? ""))} />
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

              {showsActions && rowAction && (
                <TableCell className="text-right">
                  <form action={rowAction} className="inline-flex items-center gap-1">
                    <input type="hidden" name="id" value={row.id} />
                    {(row.actions ?? rowActions ?? []).map((action) => (
                      <button
                        key={action.value}
                        type="submit"
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
                    ))}
                  </form>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-[12px] text-muted">
        <span>
          {filtered.length === 1
            ? "1 record"
            : `${start + 1}–${Math.min(start + pageSize, filtered.length)} of ${filtered.length}`}
        </span>
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
      </div>
    </div>
  );
}
