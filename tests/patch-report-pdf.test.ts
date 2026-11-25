import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import { splitCveIds } from "../lib/patching/cve";
import { buildPatchReportPdf, type PatchReportModel } from "../lib/patching/report-pdf";
import { WORDMARK } from "../lib/patching/wordmark";

/**
 * The report is checked through its own bytes: pdf-lib flate-compresses every
 * stream, and text arrives as `<hex> Tj`, so the helpers below inflate the
 * streams and decode the runs. That way the tests read what a reader would see.
 */

function inflated(bytes: Uint8Array): string[] {
  const buffer = Buffer.from(bytes);
  const streams: string[] = [];
  let index = 0;
  for (;;) {
    const start = buffer.indexOf("stream", index);
    if (start < 0) break;
    let from = start + "stream".length;
    if (buffer[from] === 0x0d) from += 1;
    if (buffer[from] === 0x0a) from += 1;
    const end = buffer.indexOf("endstream", from);
    if (end < 0) break;
    try {
      streams.push(inflateSync(buffer.subarray(from, end)).toString("latin1"));
    } catch {
      // Not every stream is flate — the rest are skipped.
    }
    index = end + "endstream".length;
  }
  return streams;
}

/** Every text run in the document, in the order the page drew them. */
function drawnText(bytes: Uint8Array): string {
  return inflated(bytes)
    .flatMap((stream) => [...stream.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)])
    .map((match) => Buffer.from(match[1], "hex").toString("latin1"))
    .join("\n");
}

function pageCount(bytes: Uint8Array): number {
  for (const stream of inflated(bytes)) {
    const match = /\/Type\s*\/Pages[\s\S]{0,120}?\/Count\s+(\d+)/.exec(stream);
    if (match) return Number(match[1]);
  }
  return 0;
}

function endpoint(overrides: Partial<PatchReportModel["endpoints"][number]> = {}) {
  return {
    name: "SRV-CHE-01",
    status: "Approved",
    statusTone: "positive" as const,
    fields: [
      { label: "Planned date", value: "21 Nov 2026" },
      { label: "IT member handling", value: "Vignesh M" },
      { label: "Approved provided by", value: "Priya Nair" },
      { label: "Verified by", value: "Sneha R" },
      { label: "Update status", value: "Success · Vignesh M", tone: "positive" as const },
    ],
    counts: "12 missing patches · 3 other updates",
    note: "",
    updates: [
      { name: "Cumulative Update for Windows Server 2019 (KB5063878)", kb: "KB5063878", cve: "CVE-2025-1000", severity: "Critical" },
      { name: "Security Intelligence Update for Defender", kb: "KB2267602", cve: "", severity: "Important" },
    ],
    ...overrides,
  };
}

function model(overrides: Partial<PatchReportModel> = {}): PatchReportModel {
  return {
    prepared: "19 Nov 2026",
    summary: "1 endpoint · 12 missing patches · 3 other updates",
    outcomes: "1 success · 0 partial · 0 failed · 0 not run",
    endpoints: [endpoint()],
    ...overrides,
  };
}

test("the report is a real PDF that says what the sheet says", async () => {
  const bytes = await buildPatchReportPdf(model());
  const text = drawnText(bytes);

  assert.equal(Buffer.from(bytes).subarray(0, 5).toString("latin1"), "%PDF-");
  assert.match(text, /Patching report/);
  assert.match(text, /Prepared 19 Nov 2026/);
  assert.match(text, /1\. SRV-CHE-01/);
  assert.match(text, /Approved/);
  // Field labels are set in small caps, so they arrive uppercased.
  assert.match(text, /PLANNED DATE/);
  assert.match(text, /Cumulative Update for Windows Server 2019/);
  assert.match(text, /CVE-2025-1000/);
  assert.match(text, /Critical/);
  assert.match(text, /Infeara Technologies/);
  assert.match(text, /Page 1 of 1/);
});

test("the wordmark is drawn as vector paths, not a bitmap", async () => {
  const bytes = await buildPatchReportPdf(model());
  const content = inflated(bytes).join("\n");

  // The first command of the flattened wordmark, and no image anywhere.
  assert.match(content, /1407 364 m/);
  const navy = "0.09019607843137255 0.17254901960784313 0.3215686274509804 rg";
  assert.ok(content.indexOf(navy) < content.indexOf("1407 364 m"), "the mark is filled navy");
  assert.doesNotMatch(content, /\/Subtype\s*\/Image/);
  assert.ok(WORDMARK.path.startsWith("M"), "the path starts with a moveto");
  assert.ok(WORDMARK.width / WORDMARK.height > 9 && WORDMARK.width / WORDMARK.height < 10);
});

test("nothing about the browser gets stamped on the sheet", async () => {
  const bytes = await buildPatchReportPdf(model());
  const text = drawnText(bytes);

  // A browser print stamps the document title and the address bar; the PDF
  // carries our own footer and page numbers instead.
  assert.doesNotMatch(text, /localhost|https?:\/\/|about:blank|file:\/\//);
});

test("a long register spills onto more pages and numbers every one", async () => {
  const updates = Array.from({ length: 26 }, (_, index) => ({
    name: `Update ${index + 1} for Windows Server 2019 (KB${5063000 + index})`,
    kb: `KB${5063000 + index}`,
    cve: `CVE-2025-${2000 + index}`,
    severity: index % 2 === 0 ? "Critical" : "Moderate",
  }));

  const bytes = await buildPatchReportPdf(
    model({
      summary: "4 endpoints · 104 missing patches",
      endpoints: [
        endpoint({ name: "SRV-CHE-01", updates }),
        endpoint({ name: "SRV-CHE-02", updates }),
        endpoint({ name: "SRV-CHE-03", updates }),
        endpoint({ name: "SRV-CHE-04", updates }),
      ],
    }),
  );

  const pages = pageCount(bytes);
  assert.ok(pages > 1, `expected more than one page, got ${pages}`);

  const text = drawnText(bytes);
  assert.match(text, new RegExp(`Page 1 of ${pages}`));
  assert.match(text, new RegExp(`Page ${pages} of ${pages}`));
  assert.match(text, /continued/);
});

test("an unreachable Action1 is said in words, not left blank", async () => {
  const bytes = await buildPatchReportPdf(
    model({
      endpoints: [
        endpoint({
          updates: [],
          listMessage: "Action1 is not connected, so the missing updates cannot be listed.",
        }),
      ],
    }),
  );

  assert.match(drawnText(bytes), /Action1 is not connected/);
});

test("characters the base fonts cannot encode do not break the file", async () => {
  const bytes = await buildPatchReportPdf(
    model({
      endpoints: [
        endpoint({
          name: "SRV-🛡 Chennai ✓",
          note: "Ça va — Δοκιμή → fine",
        }),
      ],
    }),
  );

  const text = drawnText(bytes);
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString("latin1"), "%PDF-");
  // The shield emoji is a surrogate pair, so it becomes two question marks.
  assert.match(text, /SRV-\?\? Chennai \?/);
});

test("several CVE ids print one per line instead of running into the next column", async () => {
  const bytes = await buildPatchReportPdf(
    model({
      endpoints: [
        endpoint({
          updates: [
            {
              name: "Security Update for SQL Server 2019 (KB5040946)",
              kb: "KB5040946",
              cve: "CVE-2025-21178, CVE-2025-21179, CVE-2025-21200",
              severity: "Important",
            },
          ],
        }),
      ],
    }),
  );

  const text = drawnText(bytes);
  // Each id is its own run, so it lands on its own line inside the CVE column.
  for (const id of ["CVE-2025-21178", "CVE-2025-21179", "CVE-2025-21200"]) {
    assert.match(text, new RegExp(`^${id}$`, "m"));
  }
  // The joined string is gone — that is what used to overflow the column.
  assert.doesNotMatch(text, /CVE-2025-21178, CVE-2025-21179/);
});

test("the CVE splitter keeps ids, uppercases them and drops repeats", () => {
  assert.deepEqual(splitCveIds("CVE-2025-1000, CVE-2025-1001"), ["CVE-2025-1000", "CVE-2025-1001"]);
  assert.deepEqual(splitCveIds("cve-2025-1000 CVE-2025-1000"), ["CVE-2025-1000"]);
  assert.deepEqual(splitCveIds("CVE-2025-1000;CVE-2025-1001"), ["CVE-2025-1000", "CVE-2025-1001"]);
  assert.deepEqual(splitCveIds("not listed"), ["not listed"]);
  assert.deepEqual(splitCveIds(""), []);
  assert.deepEqual(splitCveIds(null), []);
});

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("an uploaded logo replaces the wordmark in the header", async () => {
  const bytes = await buildPatchReportPdf(model(), {
    logo: { type: "png", bytes: new Uint8Array(TINY_PNG) },
  });
  // Image XObjects are objects rather than page streams, so the dictionaries are
  // read from the file as a whole.
  const raw = Buffer.from(bytes).toString("latin1");
  const content = inflated(bytes).join("\n");

  assert.match(raw, /\/Subtype\s*\/Image/);
  // The vector wordmark is not drawn when a logo is present.
  assert.doesNotMatch(content, /1407 364 m/);
  // Everything else on the sheet is unchanged.
  assert.match(drawnText(bytes), /Patching report/);
});

test("a logo that cannot be embedded falls back to the wordmark", async () => {
  const bytes = await buildPatchReportPdf(model(), {
    logo: { type: "png", bytes: new Uint8Array(Buffer.from("not an image at all")) },
  });
  const raw = Buffer.from(bytes).toString("latin1");
  const content = inflated(bytes).join("\n");

  assert.match(content, /1407 364 m/);
  assert.doesNotMatch(raw, /\/Subtype\s*\/Image/);
  assert.match(drawnText(bytes), /Page 1 of 1/);
});
