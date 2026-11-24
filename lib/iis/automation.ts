/**
 * The ingestion contract for IIS applications.
 *
 * A Windows server runs one PowerShell task and posts what it found. Everything
 * that arrives is untrusted text from another machine, so it is parsed here —
 * one small, testable function — and the route writes nothing until this says
 * the payload is whole.
 *
 * The role list is deliberately narrower than the capability model: reading and
 * editing the IIS register in the browser is allowed for IT engineering too, but
 * a machine that can rewrite the whole register from a script is a different
 * kind of access. Only the IT manager and the platform owner hold it.
 */

import {
  isAppStatus,
  isDirectoryBrowsing,
  isEnvironment,
  type AppStatus,
  type DirectoryBrowsing,
  type Environment,
} from "./constants";
import type { RoleId } from "../roles";

/** Who may push the register. Checked by role, not by scope. */
export const IIS_AUTOMATION_ROLES: RoleId[] = ["super_admin", "it_manager"];

export function canIngestIis(role: RoleId): boolean {
  return IIS_AUTOMATION_ROLES.includes(role);
}

/**
 * A server reports the sites it knows about. One UAT host in this estate runs
 * past three hundred, so the ceiling is generous — the collector still posts in
 * batches, because a request body has its own limits.
 */
export const MAX_AUTOMATION_APPLICATIONS = 1000;

export type AutomationApplication = {
  name: string;
  bindingHost: string;
  bindingPort: number | null;
  sslMapped: boolean;
  sslCertificate: string;
  sslThumbprint: string;
  sslExpiresAt: string | null;
  appPool: string;
  directoryBrowsing: DirectoryBrowsing;
  appRoot: string;
  status: AppStatus;
};

export type AutomationPayload = {
  server: string;
  environment: Environment;
  applications: AutomationApplication[];
};

export type ParseResult =
  | { ok: true; payload: AutomationPayload }
  | { ok: false; error: string };

function field(source: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function string(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function bool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return /^(true|yes|1|enabled)$/i.test(value.trim());
  return false;
}

function port(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(number) || number < 1 || number > 65535) return "invalid";
  return number;
}

/**
 * Parses a collector POST.
 *
 * The script sends `{ server, environment, applications: [...] }`, but a person
 * with curl will send `applications` at the top level or spell a field in
 * camelCase — both are accepted, because refusing a payload over a synonym
 * teaches nobody anything.
 */
export function parseAutomationPayload(body: unknown): ParseResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Send a JSON object." };
  }

  const root = body as Record<string, unknown>;
  const rawApps = Array.isArray(root.applications)
    ? root.applications
    : Array.isArray(root.sites)
      ? root.sites
      : null;
  if (!rawApps) {
    return { ok: false, error: "Send `applications` as an array of IIS applications." };
  }
  if (rawApps.length === 0) {
    return { ok: false, error: "`applications` is empty — nothing to ingest." };
  }
  if (rawApps.length > MAX_AUTOMATION_APPLICATIONS) {
    return {
      ok: false,
      error: `Send at most ${MAX_AUTOMATION_APPLICATIONS} applications in one request.`,
    };
  }

  const server = string(field(root, "server", "serverHostName", "host")).replace(/\s+/g, " ");
  if (server.length < 2) {
    return { ok: false, error: "Send `server` — the Windows host name the applications live on." };
  }
  if (server.length > 80) return { ok: false, error: "Keep `server` under 80 characters." };

  const environmentValue = string(field(root, "environment")) || "production";
  const environment: Environment = isEnvironment(environmentValue)
    ? environmentValue
    : "production";

  const applications: AutomationApplication[] = [];
  const seen = new Set<string>();

  for (const [index, entry] of rawApps.entries()) {
    const where = `application ${index + 1}`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, error: `${where} is not an object.` };
    }
    const row = entry as Record<string, unknown>;

    const name = string(field(row, "name", "applicationName", "site")).replace(/\s+/g, " ");
    if (name.length < 2) return { ok: false, error: `${where} needs a \`name\` of 2–80 characters.` };
    if (name.length > 80) return { ok: false, error: `${where}: keep \`name\` under 80 characters.` };

    const key = name.toLowerCase();
    if (seen.has(key)) {
      return {
        ok: false,
        error: `"${name}" appears twice on ${server} — the register keys on the name.`,
      };
    }
    seen.add(key);

    const bindingHost = string(field(row, "bindingHost", "bindingHostName", "hostName"));
    if (bindingHost.length > 200) {
      return { ok: false, error: `${where}: keep \`bindingHost\` under 200 characters.` };
    }

    const bindingPort = port(field(row, "bindingPort", "port"));
    if (bindingPort === "invalid") {
      return { ok: false, error: `${where}: \`bindingPort\` must be a whole number 1–65535.` };
    }

    const sslCertificate = string(
      field(row, "sslCertificate", "certificate", "certificateName", "certificateSubject"),
    );
    if (sslCertificate.length > 200) {
      return { ok: false, error: `${where}: keep \`sslCertificate\` under 200 characters.` };
    }

    // Thumbprints arrive with colons, spaces and lowercase hex; one form is stored.
    const sslThumbprint = string(
      field(row, "sslThumbprint", "thumbprint", "certificateHash", "certHash"),
    )
      .replace(/[^0-9A-Fa-f]/g, "")
      .toUpperCase();
    if (sslThumbprint.length > 0 && (sslThumbprint.length < 32 || sslThumbprint.length > 64)) {
      return { ok: false, error: `${where}: \`sslThumbprint\` is not a certificate thumbprint.` };
    }

    const sslExpiresRaw = string(field(row, "sslExpiresAt", "certificateExpiry", "sslExpiry"));
    if (sslExpiresRaw && !/^\d{4}-\d{2}-\d{2}$/.test(sslExpiresRaw)) {
      return { ok: false, error: `${where}: \`sslExpiresAt\` must be a date, YYYY-MM-DD.` };
    }

    const appPool = string(field(row, "appPool", "applicationPool"));
    if (appPool.length > 80) {
      return { ok: false, error: `${where}: keep \`appPool\` under 80 characters.` };
    }

    const browsingRaw = string(field(row, "directoryBrowsing", "directoryBrowse")) || "disabled";
    if (!isDirectoryBrowsing(browsingRaw.toLowerCase())) {
      return { ok: false, error: `${where}: \`directoryBrowsing\` is enabled or disabled.` };
    }

    const appRoot = string(field(row, "appRoot", "physicalPath", "rootPath"));
    if (appRoot.length > 260) {
      return { ok: false, error: `${where}: keep \`appRoot\` under 260 characters.` };
    }

    const statusRaw = string(field(row, "status")) || "running";
    if (!isAppStatus(statusRaw)) {
      return { ok: false, error: `${where}: \`status\` is not a state this register knows.` };
    }

    applications.push({
      name,
      bindingHost,
      bindingPort,
      sslMapped: bool(field(row, "sslMapped", "ssl", "https")),
      sslCertificate,
      sslThumbprint,
      sslExpiresAt: sslExpiresRaw || null,
      appPool,
      directoryBrowsing: browsingRaw.toLowerCase() as DirectoryBrowsing,
      appRoot,
      status: statusRaw,
    });
  }

  return { ok: true, payload: { server, environment, applications } };
}
