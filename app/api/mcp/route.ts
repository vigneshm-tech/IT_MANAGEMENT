import { NextResponse } from "next/server";
import { API_SCOPES } from "@/lib/api/scopes";
import { authenticateRequest, credentialFrom } from "@/lib/api/auth";
import { fail } from "@/lib/api/http";
import { checkApiRateLimit } from "@/lib/api/rate-limit";
import { credentialLabel, recordMcpRequest } from "@/lib/mcp/log";
import {
  handleMcpMessage,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_INFO,
  toolCatalogue,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "@/lib/mcp/server";

export const dynamic = "force-dynamic";

/**
 * The MCP endpoint: one POST, one JSON-RPC answer.
 *
 * Streamable HTTP allows either `application/json` or an SSE stream in reply.
 * Every tool here answers in one message, so the simple form is the honest one —
 * and a single JSON response is in the spec, so an SSE-expecting client works
 * too. `GET` never opens a stream; it is a probe that reports what the server is
 * and who you are.
 *
 * Auth is either a personal key (`tt_…`) or an OAuth access token (`ttm_…`).
 * Nothing about the transport changes who the caller is.
 */

const MAX_BATCH = 20;

/**
 * MCP is called from desktop apps and from browser-based clients alike. The
 * endpoint carries no cookies and authorises on the header alone, so a wildcard
 * origin gives away nothing a `tt_` key does not already give away.
 */
const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, content-type, mcp-protocol-version, mcp-session-id, accept, x-api-key",
  "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
  "access-control-expose-headers":
    "mcp-session-id, x-ratelimit-limit, x-ratelimit-remaining, retry-after",
};

function withCors(response: Response): Response {
  for (const [key, value] of Object.entries(CORS)) response.headers.set(key, value);
  return response;
}

function jsonRpcError(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/** The credential kind, as a label for the log — never the credential. */
function credentialOf(request: Request): string | null {
  return credentialLabel(credentialFrom(request));
}

function transportOf(request: Request) {
  return {
    verb: request.method,
    accept: request.headers.get("accept"),
    userAgent: request.headers.get("user-agent"),
    protocolVersion: request.headers.get("mcp-protocol-version"),
  };
}

export async function POST(request: Request) {
  const transport = transportOf(request);
  const credential = credentialOf(request);

  const auth = await authenticateRequest(request);
  if (!auth.ok) {
    const body = await auth.response.clone().text();
    await recordMcpRequest({
      ...transport,
      status: auth.response.status,
      credential,
      detail: `auth: ${body.slice(0, 180)}`,
    });
    return withCors(auth.response);
  }

  const limit = checkApiRateLimit(auth.caller.keyId);
  if (!limit.allowed) {
    await recordMcpRequest({
      ...transport,
      status: 429,
      credential,
      detail: "rate limited",
    });
    const response = fail(429, "rate_limited", "Too many requests. Try again shortly.");
    response.headers.set("retry-after", String(limit.resetSeconds));
    return withCors(response);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    await recordMcpRequest({
      ...transport,
      status: 400,
      credential,
      detail: "parse error: body is not JSON",
    });
    return withCors(
      NextResponse.json(jsonRpcError(null, -32700, "Parse error: the body is not JSON."), {
        status: 400,
        headers: { "cache-control": "no-store" },
      }),
    );
  }

  if (Array.isArray(payload) && payload.length > MAX_BATCH) {
    await recordMcpRequest({
      ...transport,
      status: 400,
      credential,
      detail: `batch of ${payload.length} > ${MAX_BATCH}`,
    });
    return withCors(
      NextResponse.json(jsonRpcError(null, -32600, `Send at most ${MAX_BATCH} messages at a time.`), {
        status: 400,
        headers: { "cache-control": "no-store" },
      }),
    );
  }

  const batch = Array.isArray(payload) ? payload.slice(0, MAX_BATCH) : [payload];
  const methods: string[] = [];
  const responses: JsonRpcResponse[] = [];

  for (const message of batch) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      methods.push("(invalid)");
      responses.push(jsonRpcError(null, -32600, "Not a JSON-RPC 2.0 request."));
      continue;
    }
    const request_ = message as JsonRpcRequest;
    methods.push(typeof request_.method === "string" ? request_.method : "(none)");
    const response = await handleMcpMessage(request_, auth.caller);
    if (response) responses.push(response);
  }

  const rpcMethod = methods.join(", ") || null;
  const detail =
    responses.length === 0
      ? "notification: accepted"
      : responses
          .map((response) =>
            "error" in response && response.error
              ? `error ${response.error.code}: ${response.error.message.slice(0, 80)}`
              : "ok",
          )
          .join("; ");

  // Only notifications: acknowledged, nothing to say.
  if (responses.length === 0) {
    await recordMcpRequest({ ...transport, rpcMethod, status: 202, credential, detail });
    return withCors(
      new NextResponse(null, {
        status: 202,
        headers: { "cache-control": "no-store", "x-ratelimit-remaining": String(limit.remaining) },
      }),
    );
  }

  await recordMcpRequest({ ...transport, rpcMethod, status: 200, credential, detail });

  return withCors(
    NextResponse.json(Array.isArray(payload) ? responses : responses[0], {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "x-ratelimit-limit": String(limit.limit),
        "x-ratelimit-remaining": String(limit.remaining),
        "mcp-protocol-version": MCP_PROTOCOL_VERSION,
      },
    }),
  );
}

/**
 * No server-initiated stream: every tool answers in the POST that asked.
 *
 * A client that opens a `text/event-stream` GET gets the spec's own 405, so it
 * falls back to POSTing instead of waiting on a socket that will never speak.
 * Anything else — a browser, `curl`, a person checking whether their connector
 * is configured — gets a real answer about the server and the credential.
 */
export async function GET(request: Request) {
  const transport = transportOf(request);
  const credential = credentialOf(request);
  const wantsStream = (request.headers.get("accept") ?? "").includes("text/event-stream");

  if (wantsStream) {
    await recordMcpRequest({ ...transport, status: 405, credential, detail: "stream refused" });
    return withCors(
      new NextResponse(
        JSON.stringify({
          error: {
            code: "stream_unsupported",
            message: "This MCP server answers POSTed JSON-RPC; it does not open a GET stream.",
          },
        }),
        {
          status: 405,
          headers: {
            allow: "POST, DELETE, OPTIONS",
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        },
      ),
    );
  }

  const auth = await authenticateRequest(request);
  if (!auth.ok) {
    await recordMcpRequest({
      ...transport,
      status: auth.response.status,
      credential,
      detail: "probe without a usable credential",
    });
    return withCors(auth.response);
  }

  await recordMcpRequest({ ...transport, status: 200, credential, detail: "probe: ok" });

  return withCors(
    NextResponse.json(
      {
        server: MCP_SERVER_INFO,
        protocolVersion: MCP_PROTOCOL_VERSION,
        transport: "streamable-http",
        accepts: "POST with a JSON-RPC 2.0 body",
        caller: {
          name: auth.caller.name,
          email: auth.caller.email,
          role: auth.caller.role,
          credential: auth.caller.keyName,
        },
        scopes: auth.caller.scopes,
        tools: toolCatalogue(auth.caller).map((tool) => tool.name),
        scopeCatalogue: API_SCOPES.map((scope) => scope.id),
      },
      { headers: { "cache-control": "no-store" } },
    ),
  );
}

/** Session termination is accepted and ignored: there is no session to end. */
export async function DELETE() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function HEAD() {
  return withCors(new NextResponse(null, { status: 204 }));
}
