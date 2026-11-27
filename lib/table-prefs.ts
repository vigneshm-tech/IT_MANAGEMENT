/**
 * Pure helpers behind the customisable tables (see `components/ui/data-table.tsx`).
 * Kept free of React so the persistence rules can be tested directly.
 */

export type TablePrefs = {
  /** Column keys in display order. */
  order: string[];
  hidden: string[];
  /** 0 renders every filtered row. */
  pageSize: number;
  density: "comfortable" | "compact";
};

export const PAGE_SIZES = [8, 10, 25, 50, 0] as const;

export const STORAGE_PREFIX = "tt.table.v1.";

export function defaultPrefs(
  keys: string[],
  defaultHidden: string[] = [],
  pageSize = 8,
): TablePrefs {
  return {
    order: [...keys],
    hidden: defaultHidden.filter((key) => keys.includes(key)),
    pageSize,
    density: "comfortable",
  };
}

/** Validates whatever was read back from storage. */
export function normalisePrefs(
  stored: Partial<TablePrefs> | null | undefined,
  defaults: TablePrefs,
): TablePrefs {
  const order = Array.isArray(stored?.order) ? stored.order.filter(isString) : defaults.order;
  const hidden = Array.isArray(stored?.hidden) ? stored.hidden.filter(isString) : defaults.hidden;
  const pageSize =
    typeof stored?.pageSize === "number" && (PAGE_SIZES as readonly number[]).includes(stored.pageSize)
      ? stored.pageSize
      : defaults.pageSize;

  return {
    order,
    hidden,
    pageSize,
    density: stored?.density === "compact" ? "compact" : "comfortable",
  };
}

/** Keeps a stored order/hidden list aligned with the columns this build ships. */
export function reconcilePrefs(prefs: TablePrefs, keys: string[]): TablePrefs {
  const order = [
    ...prefs.order.filter((key) => keys.includes(key)),
    ...keys.filter((key) => !prefs.order.includes(key)),
  ];
  const hidden = prefs.hidden.filter((key) => keys.includes(key));

  // A table with no visible column is useless — the first one always stays.
  if (order.length > 0 && order.every((key) => hidden.includes(key))) {
    return { ...prefs, order, hidden: hidden.filter((key) => key !== order[0]) };
  }

  return { ...prefs, order, hidden };
}

export function visibleKeys(prefs: TablePrefs): string[] {
  return prefs.order.filter((key) => !prefs.hidden.includes(key));
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(headers: string[], rows: string[][]): string {
  return [headers.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))].join(
    "\r\n",
  );
}
