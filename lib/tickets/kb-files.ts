/**
 * The ticket knowledge base: a private library of files.
 *
 * The Knowledge base module is articles. This is the other half — the vendor PDF,
 * the screenshot of the error, the export somebody sent — kept inside Tickets,
 * where the person answering already is.
 *
 * Everything here is pure so both the uploader (a client component) and the
 * routes can use it without dragging the Supabase server client into a bundle.
 */

export type KbFileKind = "pdf" | "image" | "document" | "sheet" | "slides" | "text" | "archive" | "other";

export type KbFileRecord = {
  id: string;
  title: string;
  description: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  tags: string[];
  uploadedById: string;
  uploadedByName: string;
  createdAt: string;
  active: boolean;
};

/**
 * 4 MB, not because the library should be small but because the upload travels
 * through a serverless request body, which Vercel caps at 4.5 MB. Anything larger
 * would fail at the platform before our code ran — better to say so first.
 */
export const KB_FILE_MAX_BYTES = 4 * 1024 * 1024;

export const KB_FILE_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.zip";

const EXTENSION_KINDS: Record<string, KbFileKind> = {
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  doc: "document",
  docx: "document",
  xls: "sheet",
  xlsx: "sheet",
  csv: "sheet",
  ppt: "slides",
  pptx: "slides",
  txt: "text",
  md: "text",
  zip: "archive",
};

export const KB_FILE_KIND_LABELS: Record<KbFileKind, string> = {
  pdf: "PDF",
  image: "Image",
  document: "Document",
  sheet: "Spreadsheet",
  slides: "Slides",
  text: "Text",
  archive: "Archive",
  other: "File",
};

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function kbFileKind(name: string, mimeType = ""): KbFileKind {
  const byExtension = EXTENSION_KINDS[fileExtension(name)];
  if (byExtension) return byExtension;
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("text/")) return "text";
  return "other";
}

/** Browsers can render these in place; everything else downloads. */
export function canPreviewInline(name: string, mimeType = ""): boolean {
  const kind = kbFileKind(name, mimeType);
  if (kind === "pdf" || kind === "image" || kind === "text") return true;
  return mimeType === "application/pdf" || mimeType.startsWith("image/") || mimeType.startsWith("text/");
}

/** "1.4 MB", "812 KB", "96 bytes". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 bytes";
  if (bytes < 1024) return `${Math.round(bytes)} bytes`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/**
 * What Storage will accept as a name.
 *
 * Non-ASCII characters survive in the original filename, which the table still
 * shows, but the object path is ASCII so a download header never has to quote it.
 */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(-90);
  return cleaned || "file";
}

export function storagePathFor(id: string, name: string): string {
  return `${id}/${safeFileName(name)}`;
}

/** The title defaults to the filename without its extension, so upload is one field. */
export function defaultTitleFromFile(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

export type KbFileInput = {
  title: string;
  description: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export function kbFileError(input: KbFileInput): string | null {
  const title = input.title.replace(/\s+/g, " ").trim();
  if (title.length < 2) return "Give the file a title of at least 2 characters.";
  if (title.length > 120) return "Keep the title under 120 characters.";
  if (input.description.length > 500) return "Keep the description under 500 characters.";

  const extension = fileExtension(input.fileName);
  if (!extension) return "The file needs an extension we recognise (PDF, image, Office, text or zip).";
  if (!EXTENSION_KINDS[extension]) {
    return `.${extension} files are not accepted. Upload a PDF, an image, an Office document, a text file or a zip.`;
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) return "That file is empty.";
  if (input.sizeBytes > KB_FILE_MAX_BYTES) {
    return `Files are capped at ${formatBytes(KB_FILE_MAX_BYTES)}. Compress it or split it.`;
  }
  return null;
}

/** "draft, vpn, Guide" → ["draft","vpn","guide"] — stable, de-duplicated, capped. */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const piece of raw.split(/[,;\n]+/)) {
    const tag = piece
      .trim()
      .replace(/^#+/, "")
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 24);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length === 8) break;
  }
  return tags;
}

/** Search over the fields a person would type, case-insensitive. */
export function matchesKbFile(file: KbFileRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [file.title, file.description, file.fileName, ...file.tags]
    .join(" ")
    .toLowerCase()
    .includes(q);
}
