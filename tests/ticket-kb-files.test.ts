import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KB_FILE_MAX_BYTES,
  canPreviewInline,
  defaultTitleFromFile,
  formatBytes,
  kbFileError,
  kbFileKind,
  matchesKbFile,
  parseTags,
  safeFileName,
  storagePathFor,
  type KbFileRecord,
} from "../lib/tickets/kb-files";
import {
  deleteKbFile,
  listKbFiles,
  readKbFile,
  saveKbFile,
} from "../lib/tickets/kb-files-store";

const input = (overrides: Partial<Parameters<typeof kbFileError>[0]> = {}) => ({
  title: "VPN runbook",
  description: "",
  fileName: "vpn-runbook.pdf",
  mimeType: "application/pdf",
  sizeBytes: 120_000,
  ...overrides,
});

/* ------------------------------- validation ------------------------------ */

test("a file needs a title, a known extension and a plausible size", () => {
  assert.match(kbFileError(input({ title: "" })) ?? "", /at least 2 characters/);
  assert.match(kbFileError(input({ fileName: "runbook" })) ?? "", /needs an extension/);
  assert.match(kbFileError(input({ fileName: "payload.exe" })) ?? "", /not accepted/);
  assert.match(kbFileError(input({ sizeBytes: 0 })) ?? "", /empty/);
  assert.match(
    kbFileError(input({ sizeBytes: KB_FILE_MAX_BYTES + 1 })) ?? "",
    /capped at 4\.0 MB/,
  );
  assert.equal(kbFileError(input()), null);
  // Every extension we advertise has to pass its own check.
  for (const name of ["a.pdf", "b.PNG", "c.docx", "d.xlsx", "e.csv", "f.zip", "g.md"]) {
    assert.equal(kbFileError(input({ fileName: name })), null, name);
  }
});

/* -------------------------------- helpers -------------------------------- */

test("sizes read the way people say them", () => {
  assert.equal(formatBytes(96), "96 bytes");
  assert.equal(formatBytes(812 * 1024), "812 KB");
  assert.equal(formatBytes(1.4 * 1024 * 1024), "1.4 MB");
  assert.equal(formatBytes(KB_FILE_MAX_BYTES), "4.0 MB");
});

test("kinds come from the extension first, then the mime type", () => {
  assert.equal(kbFileKind("report.pdf"), "pdf");
  assert.equal(kbFileKind("shot.PNG"), "image");
  assert.equal(kbFileKind("budget.xlsx"), "sheet");
  assert.equal(kbFileKind("notes"), "other"); // no extension and no mime
  assert.equal(kbFileKind("notes", "text/plain"), "text");
  assert.equal(kbFileKind("blob", "application/octet-stream"), "other");

  assert.equal(canPreviewInline("report.pdf"), true);
  assert.equal(canPreviewInline("shot.jpg"), true);
  assert.equal(canPreviewInline("notes.txt"), true);
  assert.equal(canPreviewInline("budget.xlsx"), false);
  assert.equal(canPreviewInline("archive.zip"), false);
});

test("storage names are ASCII and the title defaults to the file name", () => {
  assert.equal(safeFileName("Faktura – Q3 (final).pdf"), "Faktura-Q3-final.pdf");
  assert.equal(safeFileName("   "), "file");
  assert.equal(storagePathFor("abc", "Policy 2026.docx"), "abc/Policy-2026.docx");
  assert.equal(defaultTitleFromFile("vpn_runbook-v2.pdf"), "vpn runbook v2");
});

test("tags are cleaned, deduplicated and capped at eight", () => {
  assert.deepEqual(parseTags("VPN, network; vpn  ,#runbook"), ["vpn", "network", "runbook"]);
  assert.equal(parseTags("a,b,c,d,e,f,g,h,i,j").length, 8);
});

test("search covers title, description, tags and the file name", () => {
  const file: KbFileRecord = {
    id: "1",
    title: "VPN reconnect runbook",
    description: "Carrier ticket steps",
    fileName: "vpn-runbook.txt",
    mimeType: "text/plain",
    sizeBytes: 10,
    tags: ["network"],
    uploadedById: "u1",
    uploadedByName: "Meera",
    createdAt: new Date().toISOString(),
    active: true,
  };
  assert.equal(matchesKbFile(file, "carrier"), true);
  assert.equal(matchesKbFile(file, "NETWORK"), true);
  assert.equal(matchesKbFile(file, "printer"), false);
  assert.equal(matchesKbFile(file, "   "), true);
});

/* ------------------------------ demo store ------------------------------- */

test("the demo library stores bytes, lists them and forgets them on delete", async () => {
  const before = await listKbFiles();
  assert.ok(before.length >= 1, "demo seeds should give the library something to show");

  const bytes = Buffer.from("hello knowledge base", "utf8");
  const record = await saveKbFile(
    {
      title: "Uploaded note",
      description: "A file added by the test",
      fileName: "uploaded-note.txt",
      mimeType: "text/plain",
      tags: "test, note",
      uploadedById: "u-test",
      uploadedByName: "Test Person",
    },
    bytes,
  );

  assert.equal(record.sizeBytes, bytes.byteLength);
  assert.deepEqual(record.tags, ["test", "note"]);

  const listed = await listKbFiles();
  assert.equal(listed[0]?.id, record.id, "newest first");

  const stored = await readKbFile(record.id);
  assert.equal(stored?.bytes.toString("utf8"), "hello knowledge base");

  assert.equal(await deleteKbFile(record.id), true);
  assert.equal(await readKbFile(record.id), null);
  assert.equal(
    (await listKbFiles()).some((file) => file.id === record.id),
    false,
  );
});
