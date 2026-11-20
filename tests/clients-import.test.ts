import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CLIENT_IMPORT_COLUMNS,
  CLIENT_IMPORT_TEMPLATE,
  IMPORT_MAX_ROWS,
  parseCsv,
  readImportRows,
  screenImportRows,
} from "../lib/clients-import";

const HEADER = CLIENT_IMPORT_COLUMNS.join(",");

/* -------------------------------------------------------------------------- */
/*  Parsing                                                                   */
/* -------------------------------------------------------------------------- */

test("quoted cells keep commas, doubled quotes and CRLF line endings", () => {
  const rows = parseCsv('a,"b,c","say ""hi"""\r\nd,e,f\r\n');
  assert.deepEqual(rows, [
    ["a", "b,c", 'say "hi"'],
    ["d", "e", "f"],
  ]);
});

test("blank lines are ignored", () => {
  assert.deepEqual(parseCsv("a,b\n\n\nc,d\n"), [
    ["a", "b"],
    ["c", "d"],
  ]);
});

test("the shipped template parses against its own header", () => {
  const parsed = readImportRows(CLIENT_IMPORT_TEMPLATE);
  assert.ok(!("error" in parsed));
  if ("error" in parsed) return;
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].input?.name, "Acme Manufacturing");
  assert.equal(parsed.rows[0].input?.code, "ACME");
});

/* -------------------------------------------------------------------------- */
/*  Validation                                                                */
/* -------------------------------------------------------------------------- */

test("a missing name column is refused before any row is judged", () => {
  const parsed = readImportRows("code,industry\nACME,Manufacturing");
  assert.deepEqual(parsed, {
    error: 'The first line must be a header row containing a "name" column.',
  });
});

test("headers match whatever case and spacing the sheet used", () => {
  const parsed = readImportRows(
    "Name,Short Code,Primary Email\nBeta Industries,BETA,ops@beta.example",
  );
  assert.ok(!("error" in parsed));
  if ("error" in parsed) return;
  assert.equal(parsed.rows[0].input?.code, "BETA");
  assert.equal(parsed.rows[0].input?.primary.email, "ops@beta.example");
});

test("a bad email or a one-letter name fails that row only", () => {
  const parsed = readImportRows(
    `${HEADER}\nGood Co,GOOD,IT,Ana,ana@good.example,9840012345,IN,,,\nX,XX,IT,,,,IN,,,\nBad Co,BAD,IT,Bo,not-an-email,9840012345,IN,,,`,
  );
  assert.ok(!("error" in parsed));
  if ("error" in parsed) return;

  assert.equal(parsed.rows[0].error, undefined);
  assert.match(parsed.rows[1].error ?? "", /Enter the client name/);
  assert.match(parsed.rows[2].error ?? "", /valid email address/);
  assert.deepEqual(
    parsed.rows.map((row) => row.line),
    [2, 3, 4],
  );
});

test("a blank code is derived from the name; a blank industry is allowed", () => {
  const parsed = readImportRows(`${HEADER}\nZenith Labs,,,Ana,ana@zenith.example,9840012345,IN,,,`);
  assert.ok(!("error" in parsed));
  if ("error" in parsed) return;
  assert.equal(parsed.rows[0].input?.code, "ZENITH");
  assert.equal(parsed.rows[0].input?.industry, "");
});

test("more than the row cap is refused with the count", () => {
  const rows = Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, index) => `Client ${index}`).join("\n");
  const parsed = readImportRows(`name\n${rows}`);
  assert.ok("error" in parsed);
  if (!("error" in parsed)) return;
  assert.match(parsed.error, /at most 500 rows/);
});

/* -------------------------------------------------------------------------- */
/*  Dedupe                                                                    */
/* -------------------------------------------------------------------------- */

test("rows already in the register are skipped by name and by code", () => {
  const parsed = readImportRows(
    `${HEADER}\nAcme Manufacturing,FRESH,IT,,,,\nBrand New,BNEW,IT,,,,\nSecond Co,BNEW,IT,,,,\nbrand new,BN2,IT,,,,`,
  );
  assert.ok(!("error" in parsed));
  if ("error" in parsed) return;

  const screened = screenImportRows(parsed.rows, [
    { name: "acme manufacturing", code: "OLD-CODE" },
  ]);

  assert.match(screened[0].error ?? "", /already in the register/); // same name, any case
  assert.equal(screened[1].input?.code, "BNEW"); // fresh
  assert.match(screened[2].error ?? "", /BNEW is already in use/); // taken by row 3
  assert.match(screened[3].error ?? "", /already in the register/); // duplicate of row 3
});
