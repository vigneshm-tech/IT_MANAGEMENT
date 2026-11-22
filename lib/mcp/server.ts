import type { ApiCaller } from "../api/auth";
import type { ApiScope } from "../api/scopes";
import {
  createTicketForApi,
  getTicketForApi,
  listApprovalsForApi,
  listQueuesForApi,
  listTasksForApi,
  listTicketsForApi,
  searchKbForApi,
} from "../api/resources";

/**
 * A Model Context Protocol server, spoken over one POST.
 *
 * MCP is how an assistant — Claude Desktop, an IDE, an internal agent — asks a
 * system what it can do and then does it. The transport here is the streamable
 * HTTP one reduced to its simplest honest form: the client POSTs a JSON-RPC
 * message, the server answers with one JSON-RPC message. No SSE stream, because
 * every tool in this server returns its whole answer at once.
 *
 * The tools are deliberately the same reads the REST API offers, behind the same
 * keys and the same scopes. Nothing here can do something `/api/v1` cannot, which
 * keeps one place to reason about authorisation: `lib/api/scopes.ts`.
 */

export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const MCP_SERVER_INFO = { name: "tasktornado", title: "TaskTornado", version: "1.0.0" };

export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export type McpTool = {
  name: string;
  title: string;
  description: string;
  scope: ApiScope;
  inputSchema: Record<string, unknown>;
  run: (caller: ApiCaller, args: Record<string, unknown>) => Promise<unknown>;
};

/* -------------------------------------------------------------------------- */
/*  Argument helpers — a model will send `"limit": "5"` sooner or later.       */
/* -------------------------------------------------------------------------- */

function str(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

function num(args: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  const value = args[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

const LIMIT_SCHEMA = {
  type: "integer",
  minimum: 1,
  maximum: 100,
  description: "How many rows to return (default 25, max 100).",
} as const;

/* -------------------------------------------------------------------------- */
/*  Tools                                                                     */
/* -------------------------------------------------------------------------- */

export const MCP_TOOLS: McpTool[] = [
  {
    name: "tickets_list",
    title: "List tickets",
    description:
      "List support tickets, newest activity first. Filter by state, queue or priority. Needs the tickets:read scope.",
    scope: "tickets:read",
    inputSchema: {
      type: "object",
      properties: {
        state: {
          type: "string",
          enum: ["new", "open", "pending", "resolved", "closed", "merged"],
          description: "Only tickets in this state.",
        },
        queue: { type: "string", description: "Queue id, as returned by queues_list." },
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
        limit: LIMIT_SCHEMA,
      },
      additionalProperties: false,
    },
    run: (caller, args) =>
      listTicketsForApi(caller, {
        state: str(args, "state") || undefined,
        queue: str(args, "queue") || undefined,
        priority: str(args, "priority") || undefined,
        limit: num(args, "limit", 25, 1, 100),
      }),
  },
  {
    name: "tickets_get",
    title: "Read one ticket",
    description:
      "Open one ticket with its public thread. Internal notes are included only for agents, which is what the tickets:read scope already implies.",
    scope: "tickets:read",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Ticket id, e.g. TT-1001." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    run: async (caller, args) => {
      const id = str(args, "id").toUpperCase();
      if (!id) return { found: false, message: "Pass the ticket id, e.g. TT-1001." };
      const ticket = await getTicketForApi(caller, id);
      return ticket ?? { found: false, message: `No ticket ${id}.` };
    },
  },
  {
    name: "tickets_create",
    title: "Raise a ticket",
    description:
      "File a ticket as the key's owner. Needs the tickets:write scope. Returns the new ticket id and its path in the app.",
    scope: "tickets:write",
    inputSchema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "One line, 4–160 characters." },
        body: { type: "string", description: "The first message, up to 8000 characters." },
        queueId: { type: "string", description: "Queue id; defaults to the first active queue." },
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
        tags: { type: "array", items: { type: "string" }, description: "Up to 8 short tags." },
      },
      required: ["subject", "body"],
      additionalProperties: false,
    },
    run: async (caller, args) => {
      const tags = Array.isArray(args.tags)
        ? args.tags.filter((tag): tag is string => typeof tag === "string")
        : [];
      const result = await createTicketForApi(caller, {
        subject: str(args, "subject"),
        body: str(args, "body"),
        queueId: str(args, "queueId") || undefined,
        priority: str(args, "priority") || undefined,
        tags,
      });
      return result;
    },
  },
  {
    name: "queues_list",
    title: "List queues",
    description: "The active ticket queues, with their ids and whether the public form offers them.",
    scope: "tickets:read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: (caller) => listQueuesForApi(caller),
  },
  {
    name: "kb_search",
    title: "Search the knowledge base",
    description:
      "Search articles by words in the title, summary, tags or body. Public articles only, unless the key's owner is an agent — then internal ones too.",
    scope: "kb:read",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to look for, e.g. \"vpn drops\"." },
        limit: { ...LIMIT_SCHEMA, maximum: 20 },
      },
      required: ["query"],
      additionalProperties: false,
    },
    run: (caller, args) =>
      searchKbForApi(caller, str(args, "query"), num(args, "limit", 5, 1, 20)),
  },
  {
    name: "tasks_list",
    title: "List tasks",
    description: "List tasks with their client, status, priority and owner.",
    scope: "tasks:read",
    inputSchema: {
      type: "object",
      properties: { limit: LIMIT_SCHEMA },
      additionalProperties: false,
    },
    run: (_caller, args) => listTasksForApi(num(args, "limit", 25, 1, 100)),
  },
  {
    name: "approvals_list",
    title: "List approvals",
    description: "List approval requests waiting on a decision, and the ones already decided.",
    scope: "approvals:read",
    inputSchema: {
      type: "object",
      properties: { limit: LIMIT_SCHEMA },
      additionalProperties: false,
    },
    run: (_caller, args) => listApprovalsForApi(num(args, "limit", 25, 1, 100)),
  },
];

const TOOL_BY_NAME = new Map(MCP_TOOLS.map((tool) => [tool.name, tool]));

/** What `tools/list` shows: the same tools, minus their implementation. */
export function toolCatalogue(caller: ApiCaller) {
  return MCP_TOOLS.filter((tool) => caller.scopes.includes(tool.scope)).map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

/* -------------------------------------------------------------------------- */
/*  Dispatch                                                                  */
/* -------------------------------------------------------------------------- */

function rpcError(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function textResult(value: unknown, isError = false) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

/**
 * Handles one JSON-RPC message.
 *
 * Returns `null` for notifications, which by definition get no reply — the
 * transport then answers 202 with an empty body.
 */
export async function handleMcpMessage(
  message: JsonRpcRequest,
  caller: ApiCaller,
): Promise<JsonRpcResponse | null> {
  const id = message.id ?? null;

  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return rpcError(id, -32600, "Not a JSON-RPC 2.0 request.");
  }

  switch (message.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: MCP_SERVER_INFO,
          instructions:
            "TaskTornado service desk. Use queues_list before tickets_create, and tickets_get before quoting a thread.",
        },
      };

    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "ping":
      return { jsonrpc: "2.0", id, result: {} };

    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: toolCatalogue(caller) } };

    case "tools/call": {
      const params = message.params ?? {};
      const name = typeof params.name === "string" ? params.name : "";
      const tool = TOOL_BY_NAME.get(name);
      if (!tool) return rpcError(id, -32602, `No tool called "${name}".`);

      if (!caller.scopes.includes(tool.scope)) {
        return {
          jsonrpc: "2.0",
          id,
          result: textResult(
            `This key does not carry "${tool.scope}", which ${tool.name} needs. Ask its owner to issue one that does.`,
            true,
          ),
        };
      }

      const args =
        params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
          ? (params.arguments as Record<string, unknown>)
          : {};

      try {
        const value = await tool.run(caller, args);
        return { jsonrpc: "2.0", id, result: textResult(value) };
      } catch (cause) {
        console.error(`[mcp] ${name} failed`, cause);
        return {
          jsonrpc: "2.0",
          id,
          result: textResult("The tool failed while reading the workspace. Try again.", true),
        };
      }
    }

    default:
      return rpcError(id, -32601, `Method "${message.method}" is not supported.`);
  }
}
