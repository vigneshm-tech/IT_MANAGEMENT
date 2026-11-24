import { randomUUID } from "node:crypto";
import { isSupabaseConfigured } from "../config";
import { createSupabaseServerClient, runWithServiceRole } from "../supabase/server";
import {
  formatBytes,
  parseTags,
  storagePathFor,
  type KbFileRecord,
} from "./kb-files";

/**
 * Where the ticket knowledge base's bytes and rows live.
 *
 * Supabase: bytes in the private `ticket-kb` bucket (service role only — no
 * storage policies exist), index in `public.ticket_kb_files`.
 *
 * Demo: bytes and rows in process memory, so the page can be tried without a
 * project. Two seeded text files make the library non-empty there.
 */

export const KB_BUCKET = "ticket-kb";

const TABLE = "ticket_kb_files";

type Row = {
  id: string;
  title: string;
  description: string | null;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number | string;
  tags: string[] | null;
  uploaded_by_id: string | null;
  uploaded_by_name: string | null;
  active: boolean;
  created_at: string;
};

const COLUMNS =
  "id, title, description, file_name, storage_path, mime_type, size_bytes, tags, uploaded_by_id, uploaded_by_name, active, created_at";

function mapRow(row: Row): KbFileRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    tags: row.tags ?? [],
    uploadedById: row.uploaded_by_id ?? "",
    uploadedByName: row.uploaded_by_name ?? "",
    createdAt: row.created_at,
    active: row.active,
  };
}

/* -------------------------------------------------------------------------- */
/*  Demo store                                                                */
/* -------------------------------------------------------------------------- */

type DemoStore = {
  rows: KbFileRecord[];
  paths: Map<string, string>;
  blobs: Map<string, Buffer>;
};

const globalForKb = globalThis as unknown as { __taskTornadoKbFiles?: DemoStore };

function seed(): DemoStore {
  const store: DemoStore = { rows: [], paths: new Map(), blobs: new Map() };
  const at = new Date();
  const add = (title: string, description: string, fileName: string, body: string, tags: string[]) => {
    const id = randomUUID();
    const path = storagePathFor(id, fileName);
    const bytes = Buffer.from(body, "utf8");
    store.rows.push({
      id,
      title,
      description,
      fileName,
      mimeType: "text/plain; charset=utf-8",
      sizeBytes: bytes.byteLength,
      tags,
      uploadedById: "u-it-manager",
      uploadedByName: "Meera Raghavan",
      createdAt: new Date(at.getTime() - store.rows.length * 3_600_000).toISOString(),
      active: true,
    });
    store.paths.set(id, path);
    store.blobs.set(path, bytes);
    return id;
  };

  add(
    "VPN reconnect runbook",
    "What the desk works through before raising a carrier ticket.",
    "vpn-reconnect-runbook.txt",
    [
      "VPN reconnect runbook",
      "",
      "1. Fully quit the client; do not just disconnect.",
      "2. Restart the machine and reconnect.",
      "3. Note the exact time it drops again.",
      "4. Ask whether the wired link stays up, and whether neighbours see it.",
      "",
      "Raise a carrier ticket if two people on the same floor drop within an hour.",
    ].join("\n"),
    ["vpn", "network", "runbook"],
  );

  add(
    "New laptop checklist",
    "What the desk checks before handing a laptop over.",
    "new-laptop-checklist.txt",
    [
      "New laptop checklist",
      "",
      "- Endpoint agent checked in",
      "- VPN profile used once",
      "- MFA enrolled",
      "- Mailbox signed in on the device",
      "Printing is set up on request, not by default.",
    ].join("\n"),
    ["laptop", "onboarding"],
  );

  return store;
}

function demo(): DemoStore {
  if (!globalForKb.__taskTornadoKbFiles) globalForKb.__taskTornadoKbFiles = seed();
  return globalForKb.__taskTornadoKbFiles;
}

/* -------------------------------------------------------------------------- */
/*  Reading                                                                   */
/* -------------------------------------------------------------------------- */

export async function listKbFiles(): Promise<KbFileRecord[]> {
  if (!isSupabaseConfigured) {
    return demo()
      .rows.slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return (data as Row[]).map(mapRow);
}

export type StoredKbFile = {
  record: KbFileRecord;
  bytes: Buffer;
};

export async function readKbFile(id: string): Promise<StoredKbFile | null> {
  if (!isSupabaseConfigured) {
    const store = demo();
    const record = store.rows.find((row) => row.id === id);
    if (!record) return null;
    const path = store.paths.get(id);
    const bytes = path ? store.blobs.get(path) : undefined;
    if (!bytes) return null;
    return { record, bytes };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select(`${COLUMNS}, storage_path`)
    .eq("id", id)
    .maybeSingle<Row>();

  if (error || !data) return null;

  const downloaded = await runWithServiceRole(async () => {
    const service = await createSupabaseServerClient();
    return service.storage.from(KB_BUCKET).download(data.storage_path);
  });

  if (downloaded.error || !downloaded.data) return null;

  const bytes = Buffer.from(await downloaded.data.arrayBuffer());
  return { record: mapRow(data), bytes };
}

export async function getKbFileMeta(id: string): Promise<KbFileRecord | null> {
  if (!isSupabaseConfigured) {
    return demo().rows.find((row) => row.id === id) ?? null;
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle<Row>();
  if (error || !data) return null;
  return mapRow(data);
}

/* -------------------------------------------------------------------------- */
/*  Writing                                                                   */
/* -------------------------------------------------------------------------- */

export type UploadInput = {
  title: string;
  description: string;
  fileName: string;
  mimeType: string;
  tags: string;
  uploadedById: string;
  uploadedByName: string;
};

/**
 * Stores a file and its index row.
 *
 * The object is written first, under a fresh uuid, so a failed insert leaves an
 * orphan that nobody links to rather than a row that points at nothing. If the
 * insert does fail, the object is removed on the way out.
 */
export async function saveKbFile(
  input: UploadInput,
  bytes: Buffer,
): Promise<KbFileRecord> {
  const id = randomUUID();
  const path = storagePathFor(id, input.fileName);
  const record: KbFileRecord = {
    id,
    title: input.title.replace(/\s+/g, " ").trim(),
    description: input.description.trim(),
    fileName: input.fileName,
    mimeType: input.mimeType || "application/octet-stream",
    sizeBytes: bytes.byteLength,
    tags: parseTags(input.tags),
    uploadedById: input.uploadedById,
    uploadedByName: input.uploadedByName,
    createdAt: new Date().toISOString(),
    active: true,
  };

  if (!isSupabaseConfigured) {
    const store = demo();
    store.rows.unshift(record);
    store.paths.set(id, path);
    store.blobs.set(path, bytes);
    return record;
  }

  const uploaded = await runWithServiceRole(async () => {
    const service = await createSupabaseServerClient();
    return service.storage
      .from(KB_BUCKET)
      .upload(path, bytes, { contentType: record.mimeType, upsert: false });
  });

  if (uploaded.error) {
    throw new Error(`The file could not be stored: ${uploaded.error.message}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from(TABLE).insert({
    id,
    title: record.title,
    description: record.description,
    file_name: record.fileName,
    storage_path: path,
    mime_type: record.mimeType,
    size_bytes: record.sizeBytes,
    tags: record.tags,
    uploaded_by_id: record.uploadedById,
    uploaded_by_name: record.uploadedByName,
  });

  if (error) {
    await runWithServiceRole(async () => {
      const service = await createSupabaseServerClient();
      await service.storage.from(KB_BUCKET).remove([path]);
    });
    throw new Error(`The file could not be indexed: ${error.message}`);
  }

  return record;
}

export async function deleteKbFile(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demo();
    const index = store.rows.findIndex((row) => row.id === id);
    if (index < 0) return false;
    const path = store.paths.get(id);
    store.rows.splice(index, 1);
    store.paths.delete(id);
    if (path) store.blobs.delete(path);
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from(TABLE)
    .select("storage_path")
    .eq("id", id)
    .maybeSingle<{ storage_path: string }>();

  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) return false;

  if (data?.storage_path) {
    await runWithServiceRole(async () => {
      const service = await createSupabaseServerClient();
      await service.storage.from(KB_BUCKET).remove([data.storage_path]);
    });
  }
  return true;
}

/** "Three files · 1.2 MB" — the line above the table. */
export function describeLibrary(files: KbFileRecord[]): string {
  const total = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  const count = `${files.length} ${files.length === 1 ? "file" : "files"}`;
  return files.length === 0 ? count : `${count} · ${formatBytes(total)}`;
}
