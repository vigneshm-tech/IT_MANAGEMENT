import { mobileDigits } from "./countries";
import {
  clientCodeError,
  clientNameError,
  contactError,
  deriveClientCode,
  normaliseClientCode,
  normaliseClientName,
  type ContactInput,
} from "./clients";

/**
 * CSV import for the client register.
 *
 * Pure functions only: the page, the server action and the tests share them, so
 * a row is judged the same way whether it arrives from a file or a paste box.
 */

export const IMPORT_MAX_ROWS = 500;
export const IMPORT_MAX_BYTES = 512 * 1024;

export const CLIENT_IMPORT_COLUMNS = [
  "name",
  "code",
  "industry",
  "primary_name",
  "primary_email",
  "primary_mobile",
  "primary_country",
  "secondary_name",
  "secondary_email",
  "secondary_mobile",
  "secondary_country",
] as const;

export const CLIENT_IMPORT_TEMPLATE = [
  CLIENT_IMPORT_COLUMNS.join(","),
  "Acme Manufacturing,ACME,Manufacturing,Ritu Shah,ritu.shah@acme.example,9840012345,IN,Vikram Rao,vikram.rao@acme.example,9840098765,IN",
].join("\n");

export type ImportContact = ContactInput;

export type ImportableClient = {
  name: string;
  code: string;
  industry: string;
  primary: ImportContact;
  secondary: ImportContact;
};

export type ImportRow = {
  /** 2 for the first data row (line 1 is the header). */
  line: number;
  input?: ImportableClient;
  error?: string;
};

/** RFC 4180-ish: quoted cells, embedded commas, doubled quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((value) => value.trim() !== ""));
}

function pick(row: string[], header: string[], column: string): string {
  const index = header.indexOf(column);
  return index === -1 ? "" : (row[index] ?? "").trim();
}

function contactFrom(
  row: string[],
  header: string[],
  prefix: "primary" | "secondary",
): ImportContact {
  const country = pick(row, header, `${prefix}_country`).toUpperCase();
  return {
    name: pick(row, header, `${prefix}_name`),
    email: pick(row, header, `${prefix}_email`),
    mobileCountry: country || "IN",
    mobile: mobileDigits(pick(row, header, `${prefix}_mobile`)),
  };
}

/**
 * Header names are matched case-insensitively and spaces/dashes are folded to
 * underscores, so "Primary Email" and "primary_email" land in the same column.
 */
export function readImportRows(text: string): { header: string[]; rows: ImportRow[] } | { error: string } {
  const table = parseCsv(text);
  if (table.length === 0) return { error: "Paste the rows or choose a CSV file." };

  const header = table[0].map((cell) =>
    cell.trim().toLowerCase().replace(/[\s-]+/g, "_"),
  );

  if (!header.includes("name")) {
    return { error: "The first line must be a header row containing a \"name\" column." };
  }

  const dataRows = table.slice(1);
  if (dataRows.length === 0) return { error: "The file has a header but no client rows." };
  if (dataRows.length > IMPORT_MAX_ROWS) {
    return { error: `Import at most ${IMPORT_MAX_ROWS} rows at a time (this file has ${dataRows.length}).` };
  }

  const rows = dataRows.map<ImportRow>((row, index) => {
    const line = index + 2;
    const name = normaliseClientName(pick(row, header, "name"));
    const code = normaliseClientCode(pick(row, header, "code"));
    const industry = pick(row, header, "industry").slice(0, 80);
    const primary = contactFrom(row, header, "primary");
    const secondary = contactFrom(row, header, "secondary");

    const error =
      clientNameError(name) ??
      clientCodeError(code) ??
      contactError("primary", primary) ??
      contactError("secondary", secondary);

    if (error) return { line, error };

    return {
      line,
      input: {
        name,
        code: code || deriveClientCode(name),
        industry,
        primary,
        secondary,
      },
    };
  });

  return { header, rows };
}

/**
 * Drops rows that would collide with the register or with an earlier row in the
 * same file, and numbers the rest so the action can create them in order.
 */
export function screenImportRows(
  rows: ImportRow[],
  existing: { name: string; code: string }[],
): ImportRow[] {
  const names = new Set(existing.map((client) => normaliseClientName(client.name).toLowerCase()));
  const codes = new Set(existing.map((client) => normaliseClientCode(client.code)).filter(Boolean));

  return rows.map((row) => {
    if (!row.input) return row;

    const nameKey = row.input.name.toLowerCase();
    if (names.has(nameKey)) {
      return { line: row.line, error: `"${row.input.name}" is already in the register.` };
    }
    if (row.input.code && codes.has(row.input.code)) {
      return { line: row.line, error: `The short code ${row.input.code} is already in use.` };
    }

    names.add(nameKey);
    if (row.input.code) codes.add(row.input.code);
    return row;
  });
}
