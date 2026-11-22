import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/auth";
import { fail } from "@/lib/api/http";
import { checkApiRateLimit } from "@/lib/api/rate-limit";
import {
  handleMcpMessage,
  MCP_PROTOCOL_VERSION,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "@/lib/mcp/server";

export const dynamic = "force-dynamic";

/**
 * The MCP endpoint: one POST, one JSON-RPC answer.
 *
 * Streamable HTTP allows the server to reply with either `application/json` or
 * an SSE stream. Every tool in this server answers in one message, so the simple
 * form is the honest one — and a client that expects SSE still works, because a
 * single JSON response is in the spec.
 *
 * Auth is the same personal key as `/api/v1`, sent as
 * `Authorization: Bearer tt_…`. Nothing about MCP changes who the caller is.
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
    "authorization, content-type, mcp-protocol-version, mcp-session-id, accept",
  "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
  "access-control-expose-headers": "mcp-session-id, x-ratelimit-limit, x-ratelimit-remaining, retry-after",
};

function withCors(response: Response): Response {
  for (const [key, value] of Object.entries(CORS)) response.headers.set(key, value);
  return response;
}

function jsonRpcError(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return withCors(auth.response);

  const limit = checkApiRateLimit(auth.caller.keyId);
  if (!limit.allowed) {
    const response = fail(429, "rate_limited", "Too many requests. Try again shortly.");
    response.headers.set("retry-after", String(limit.resetSeconds));
    return withCors(response);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return withCors(
      NextResponse.json(jsonRpcError(null, -32700, "Parse error: the body is not JSON."), {
        status: 400,
        headers: { "cache-control": "no-store" },
      }),
    );
  }

  const batch = Array.isArray(payload) ? payload.slice(0, MAX_BATCH) : [payload];
  if (Array.isArray(payload) && payload.length > MAX_BATCH) {
    return withCors(
      NextResponse.json(jsonRpcError(null, -32600, `Send at most ${MAX_BATCH} messages at a time.`), {
        status: 400,
        headers: { "cache-control": "no-store" },
      }),
    );
  }

  const responses: JsonRpcResponse[] = [];
  for (const message of batch) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      responses.push(jsonRpcError(null, -32600, "Not a JSON-RPC 2.0 request."));
      continue;
    }
    const response = await handleMcpMessage(message as JsonRpcRequest, auth.caller);
    if (response) responses.push(response);
  }

  // Only notifications: acknowledged, nothing to say.
  if (responses.length === 0) {
    return withCors(
      new NextResponse(null, {
        status: 202,
        headers: { "cache-control": "no-store", "x-ratelimit-remaining": String(limit.remaining) },
      }),
    );
  }

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
 * A 405 with `Allow` is the spec's own way of saying so, and it is better than
 * a hanging socket — the client falls back to POSTing instead of waiting.
 */
export async function GET() {
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

/** Session termination is accepted and ignored: there is no session to end. */
export async function DELETE() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

/**
 * A plain GET-free probe for humans: `curl /api/mcp` should explain itself
 * rather than 405 into silence.
 */
export async function HEAD() {
  return withCors(new NextResponse(null, { status: 204 }));
}
