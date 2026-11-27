import { apiRoute, readJsonObject } from "@/lib/api/handler";
import { fail, ok, textParam } from "@/lib/api/http";
import type { ApiCaller } from "@/lib/api/auth";
import { canIngestIis, parseAutomationPayload } from "@/lib/iis/automation";
import { ingestApplications, listApplications } from "@/lib/iis/repository";

export const dynamic = "force-dynamic";

/**
 * The automation endpoint for the IIS application register.
 *
 * Two gates, and the second is the unusual one: the key must carry `iis:read` /
 * `iis:write` *and* its owner must be the IT manager or the super admin. The
 * capability model alone would let an IT engineer's key through, and a script
 * that can rewrite every application on every server is not the same permission
 * as editing one row in a form — so the role is checked here, explicitly.
 */
function roleGate(caller: ApiCaller) {
  if (canIngestIis(caller.role)) return null;
  return fail(
    403,
    "role_not_permitted",
    "Only the IT manager and the super admin may read or write the IIS register through the API.",
  );
}

export async function GET(request: Request) {
  return apiRoute(request, "iis:read", async (caller) => {
    const denied = roleGate(caller);
    if (denied) return denied;

    const url = new URL(request.url);
    const server = textParam(url, "server", 80).toLowerCase();
    const all = await listApplications(false);
    const rows = (server
      ? all.filter((row) => row.server.trim().toLowerCase() === server)
      : all
    ).slice(0, 200);

    return ok(
      rows.map((row) => ({
        id: row.id,
        server: row.server,
        name: row.name,
        bindingHost: row.bindingHost,
        bindingPort: row.bindingPort,
        sslMapped: row.sslMapped,
        sslCertificate: row.sslCertificate,
        sslThumbprint: row.sslThumbprint,
        sslExpiresAt: row.sslExpiresAt,
        appPool: row.appPool,
        directoryBrowsing: row.directoryBrowsing,
        appRoot: row.appRoot,
        environment: row.environment,
        owner: row.owner,
        status: row.status,
      })),
      { count: rows.length, server: server || null },
    );
  });
}

export async function POST(request: Request) {
  return apiRoute(request, "iis:write", async (caller) => {
    const denied = roleGate(caller);
    if (denied) return denied;

    const body = await readJsonObject(request);
    if (!body.ok) return body.response;

    const parsed = parseAutomationPayload(body.body);
    if (!parsed.ok) return fail(400, "invalid_payload", parsed.error);

    try {
      const result = await ingestApplications(
        parsed.payload.server,
        parsed.payload.environment,
        parsed.payload.applications,
      );
      return ok(result, {
        count: result.created + result.updated + result.unchanged,
        created: result.created,
        updated: result.updated,
        unchanged: result.unchanged,
      });
    } catch (cause) {
      console.error("[iis] ingest failed", cause);
      return fail(
        500,
        "ingest_failed",
        cause instanceof Error ? cause.message : "The applications could not be saved.",
      );
    }
  });
}
