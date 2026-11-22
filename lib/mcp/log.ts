import { isSupabaseConfigured } from "../config";
import { createSupabaseServerClient, runWithServiceRole } from "../supabase/server";

/**
 * One line per MCP request.
 *
 * A connector that fails says "no tools loaded" whether the key was wrong, the
 * handshake was malformed or a tool threw — so the server keeps the answer. This
 * is deliberately not an audit trail (the plan defers that); it is the minimum
 * needed to debug a client without asking its user to read network logs.
 *
 * Never stores a credential: `credential` is a kind and a prefix.
 */
export type McpRequestLog = {
  verb: string;
  rpcMethod?: string | null;
  status: number;
  protocolVersion?: string | null;
  accept?: string | null;
  userAgent?: string | null;
  credential?: string | null;
  detail?: string | null;
};

export type McpRequestRecord = McpRequestLog & { at: string };

function clip(value: string | null | undefined, limit = 120): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}…` : trimmed;
}

function globalLog(): McpRequestRecord[] {
  const holder = globalThis as unknown as { __taskTornadoMcpLog?: McpRequestRecord[] };
  holder.__taskTornadoMcpLog ??= [];
  return holder.__taskTornadoMcpLog;
}

/** Best effort by design: a log that fails must never fail the call it describes. */
export async function recordMcpRequest(entry: McpRequestLog): Promise<void> {
  const row = {
    verb: clip(entry.verb, 10) ?? "POST",
    rpc_method: clip(entry.rpcMethod, 60),
    status: entry.status,
    protocol_version: clip(entry.protocolVersion, 20),
    accept: clip(entry.accept, 120),
    user_agent: clip(entry.userAgent, 120),
    credential: clip(entry.credential, 20),
    detail: clip(entry.detail, 200),
  };

  if (!isSupabaseConfigured) {
    const log = globalLog();
    log.unshift({ ...entry, at: new Date().toISOString() } as McpRequestRecord);
    if (log.length > 50) log.length = 50;
    return;
  }

  try {
    await runWithServiceRole(async () => {
      const supabase = await createSupabaseServerClient();
      await supabase.from("mcp_requests").insert(row);
    });
  } catch (cause) {
    console.error("[mcp] request log failed", cause);
  }
}

export async function recentMcpRequests(limit = 8): Promise<McpRequestRecord[]> {
  if (!isSupabaseConfigured) return globalLog().slice(0, limit);

  try {
    return await runWithServiceRole(async () => {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("mcp_requests")
        .select("at, verb, rpc_method, status, protocol_version, accept, user_agent, credential, detail")
        .order("at", { ascending: false })
        .limit(limit);
      if (error || !data) return [];
      return data.map((row) => ({
        at: row.at as string,
        verb: row.verb as string,
        rpcMethod: (row.rpc_method as string | null) ?? null,
        status: row.status as number,
        protocolVersion: (row.protocol_version as string | null) ?? null,
        accept: (row.accept as string | null) ?? null,
        userAgent: (row.user_agent as string | null) ?? null,
        credential: (row.credential as string | null) ?? null,
        detail: (row.detail as string | null) ?? null,
      }));
    });
  } catch (cause) {
    console.error("[mcp] request log read failed", cause);
    return [];
  }
}

/** `tt_abcd1234…` → `key tt_G7zW0JEE`, `ttm_…` → `oauth app`. Never the secret. */
export function credentialLabel(secret: string | null): string | null {
  if (!secret) return null;
  if (secret.startsWith("ttm_")) return "oauth token";
  if (secret.startsWith("tta_")) return "oauth code";
  if (secret.startsWith("tt_")) return `key ${secret.slice(0, 11)}…`;
  return "unknown";
}
