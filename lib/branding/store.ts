import { isSupabaseConfigured } from "../config";
import { createSupabaseServerClient } from "../supabase/server";

/**
 * The logo printed on the exported patching report.
 *
 * One row for the whole organisation: whoever holds Settings administration
 * uploads it, everyone's download carries it. Until then the report falls back
 * to the TaskTornado wordmark, which is drawn as vector paths in the code, so a
 * fresh install still produces a finished-looking sheet.
 *
 * The file is stored as base64 in the database rather than as a public object:
 * the report is the only thing that shows it, and a public URL would be one more
 * place a company mark can outlive its owner's intent. It is a header graphic —
 * a few hundred kilobytes at most — so a row is the right size of storage.
 *
 * With Supabase configured the row is `public.app_branding`; local previews keep
 * it in process memory the same way the other stores do.
 */

export const REPORT_LOGO_MAX_BYTES = 400 * 1024;

export const REPORT_LOGO_TYPES = ["image/png", "image/jpeg"] as const;

export type ReportLogoMime = (typeof REPORT_LOGO_TYPES)[number];

export type ReportLogo = {
  mime: ReportLogoMime;
  /** The file without its `data:` prefix, ready for a data URL or a PDF image. */
  base64: string;
  /** The uploaded file's name, for the person who set it. */
  name: string;
  updatedAt: string | null;
};

const ROW_ID = "report-logo";

const globalForBranding = globalThis as unknown as {
  __taskTornadoReportLogo?: ReportLogo | null;
};

export function isReportLogoMime(value: string): value is ReportLogoMime {
  return (REPORT_LOGO_TYPES as readonly string[]).includes(value);
}

export function reportLogoDataUrl(logo: ReportLogo): string {
  return `data:${logo.mime};base64,${logo.base64}`;
}

/** The bytes a PDF embedder wants. */
export function reportLogoBytes(logo: ReportLogo): Uint8Array {
  return new Uint8Array(Buffer.from(logo.base64, "base64"));
}

type BrandingRow = {
  logo_mime: string | null;
  logo_base64: string | null;
  logo_name: string | null;
  updated_at: string | null;
};

export async function readReportLogo(): Promise<ReportLogo | null> {
  if (!isSupabaseConfigured) {
    return globalForBranding.__taskTornadoReportLogo ?? null;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("app_branding")
      .select("logo_mime,logo_base64,logo_name,updated_at")
      .eq("id", ROW_ID)
      .maybeSingle<BrandingRow>();

    if (error) throw error;
    if (!data?.logo_mime || !data.logo_base64) return null;
    if (!isReportLogoMime(data.logo_mime)) return null;

    return {
      mime: data.logo_mime,
      base64: data.logo_base64,
      name: data.logo_name ?? "",
      updatedAt: data.updated_at,
    };
  } catch (error) {
    // A missing migration or a narrow policy must not take the report with it:
    // a report with the wordmark on it is still a report.
    console.error("[branding] report logo read failed", error);
    return null;
  }
}

export async function saveReportLogo(
  userId: string,
  logo: { mime: ReportLogoMime; base64: string; name: string },
): Promise<void> {
  const updatedAt = new Date().toISOString();

  if (!isSupabaseConfigured) {
    globalForBranding.__taskTornadoReportLogo = { ...logo, updatedAt };
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("app_branding").upsert(
    {
      id: ROW_ID,
      logo_mime: logo.mime,
      logo_base64: logo.base64,
      logo_name: logo.name,
      updated_by: userId,
      updated_at: updatedAt,
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("[branding] report logo save failed", error);
    throw new Error("The logo could not be saved. Please try again.");
  }
}

export async function clearReportLogo(): Promise<void> {
  if (!isSupabaseConfigured) {
    globalForBranding.__taskTornadoReportLogo = null;
    return;
  }

  const supabase = await createSupabaseServerClient();
  // The row is emptied rather than deleted, so the table keeps its one row and
  // the next upload is an update rather than an insert with an id to invent.
  const { error } = await supabase
    .from("app_branding")
    .update({ logo_mime: null, logo_base64: null, logo_name: "", updated_at: new Date().toISOString() })
    .eq("id", ROW_ID);

  if (error) {
    console.error("[branding] report logo clear failed", error);
    throw new Error("The logo could not be removed. Please try again.");
  }
}
