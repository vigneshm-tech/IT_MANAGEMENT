"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/access";
import { isAssignableRole, type RoleId } from "@/lib/roles";
import type { FormState } from "@/lib/forms";
import { createClientRecord, listClients } from "@/lib/records/repository";
import {
  IMPORT_MAX_BYTES,
  readImportRows,
  screenImportRows,
  type ImportRow,
} from "@/lib/clients-import";

export type ImportState = FormState & {
  imported?: number;
  skipped?: number;
  issues?: string[];
};

function describe(row: ImportRow): string {
  return row.error ? `Line ${row.line}: ${row.error}` : "";
}

export async function importClientsAction(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await requireUser();
  if (!can(user.role, "clients", "edit")) {
    return { error: "You don't have permission to import clients." };
  }

  const pasted = String(formData.get("csv") ?? "").trim();
  const upload = formData.get("file");

  let text = pasted;
  if (!text && upload instanceof File && upload.size > 0) {
    if (upload.size > IMPORT_MAX_BYTES) {
      return { error: "Keep the file under 512 KB, or paste the rows instead." };
    }
    text = (await upload.text()).trim();
  }

  if (!text) {
    return { error: "Choose a CSV file or paste the rows." };
  }

  const parsed = readImportRows(text);
  if ("error" in parsed) return { error: parsed.error };

  const existing = (await listClients()).map((client) => ({
    name: client.name,
    code: client.code,
  }));
  const rows = screenImportRows(parsed.rows, existing);

  const ownerRole: RoleId = isAssignableRole(user.role) ? user.role : "it_manager";
  const issues: string[] = [];
  let imported = 0;

  for (const row of rows) {
    if (!row.input) {
      issues.push(describe(row));
      continue;
    }
    try {
      await createClientRecord(user, {
        ...row.input,
        ownerRole,
        assignedUserId: "",
        assignedUserName: "",
      });
      imported += 1;
    } catch (error) {
      console.error("[clients] import row failed", row.line, error);
      issues.push(`Line ${row.line}: the row could not be saved.`);
    }
  }

  const skipped = rows.length - imported;
  revalidatePath("/modules/clients");
  revalidatePath("/modules/dashboard");

  if (imported === 0) {
    return {
      error: "No rows were imported.",
      skipped,
      issues: issues.slice(0, 20),
    };
  }

  return {
    ok: true,
    message: `${imported} ${imported === 1 ? "client" : "clients"} imported${
      skipped > 0 ? `, ${skipped} skipped` : ""
    }.`,
    imported,
    skipped,
    issues: issues.slice(0, 20),
  };
}
