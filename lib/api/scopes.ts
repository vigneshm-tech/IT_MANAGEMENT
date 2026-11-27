import { can } from "../access";
import type { Capability, ModuleId } from "../modules";
import type { RoleId } from "../roles";

/**
 * What a key is allowed to do, expressed as modules and capabilities rather than
 * as routes.
 *
 * A scope is a *ceiling*: the request handler asks for `tickets:read`, the key
 * must carry it, and the role behind the key must still be able to read tickets.
 * Two gates, because a key outlives the conversation that created it — somebody
 * whose role is reduced must not keep a wider key.
 */
export type ApiScope =
  | "tickets:read"
  | "tickets:write"
  | "kb:read"
  | "tasks:read"
  | "clients:read"
  | "servers:read"
  | "approvals:read"
  | "iis:read"
  | "iis:write";

export type ApiScopeDefinition = {
  id: ApiScope;
  label: string;
  summary: string;
  /** The module capability the owner's role must hold for this scope to exist. */
  module: ModuleId;
  capability: Capability;
};

export const API_SCOPES: ApiScopeDefinition[] = [
  {
    id: "tickets:read",
    label: "Read tickets",
    summary: "Read and open any ticket, including internal notes",
    module: "tickets",
    capability: "edit",
  },
  {
    id: "tickets:write",
    label: "Raise tickets",
    summary: "Raise a ticket as the key owner",
    module: "tickets",
    capability: "create",
  },
  {
    id: "kb:read",
    label: "Read the knowledge base",
    summary: "Search articles the owner can see",
    module: "kb",
    capability: "view",
  },
  {
    id: "tasks:read",
    label: "Read tasks",
    summary: "Read tasks",
    module: "tasks",
    capability: "view",
  },
  {
    id: "clients:read",
    label: "Read clients",
    summary: "Read clients",
    module: "clients",
    capability: "view",
  },
  {
    id: "servers:read",
    label: "Read servers",
    summary: "Read servers",
    module: "servers",
    capability: "view",
  },
  {
    /**
     * The IIS scope pair is narrower than the module: reading and editing the
     * register in the browser is open to IT engineering, but a key that can
     * rewrite the whole register from a script is held by the IT manager and the
     * platform owner only. `admin` on the module expresses that ceiling.
     */
    id: "iis:read",
    label: "Read IIS applications",
    summary: "Read IIS applications — IT manager and super admin only",
    module: "iis",
    capability: "admin",
  },
  {
    id: "iis:write",
    label: "Ingest IIS applications",
    summary: "Upload IIS applications — IT manager and super admin only",
    module: "iis",
    capability: "admin",
  },
  {
    id: "approvals:read",
    label: "Read approvals",
    summary: "Read approvals",
    module: "approvals",
    capability: "view",
  },
];

const SCOPE_IDS = new Set<string>(API_SCOPES.map((scope) => scope.id));

export function isApiScope(value: string): value is ApiScope {
  return SCOPE_IDS.has(value);
}

export function scopeLabel(id: ApiScope): string {
  return API_SCOPES.find((scope) => scope.id === id)?.label ?? id;
}

/** The scopes this role could ever be given — the same rule the checkbox list uses. */
export function grantableScopes(role: RoleId): ApiScope[] {
  return API_SCOPES.filter((scope) => can(role, scope.module, scope.capability)).map(
    (scope) => scope.id,
  );
}

/**
 * Validates the scopes posted by the create form.
 *
 * Returns the deduplicated, ordered list, or a sentence a person can act on. It
 * refuses an unknown scope by name rather than silently dropping it: a key that
 * quietly lacks a permission is worse than one that was never issued.
 */
export function resolveScopes(
  requested: string[],
  role: RoleId,
): { scopes: ApiScope[] } | { error: string } {
  const wanted = [...new Set(requested.map((value) => value.trim()).filter(Boolean))];
  if (wanted.length === 0) {
    return { error: "Pick at least one scope — a key that can do nothing is not a key." };
  }

  const unknown = wanted.filter((value) => !isApiScope(value));
  if (unknown.length > 0) {
    return { error: `"${unknown[0]}" is not a scope this API defines.` };
  }

  const allowed = new Set(grantableScopes(role));
  const refused = (wanted as ApiScope[]).filter((scope) => !allowed.has(scope));
  if (refused.length > 0) {
    return {
      error: `Your role cannot grant ${refused.map((scope) => `"${scope}"`).join(", ")}.`,
    };
  }

  const order = new Map(API_SCOPES.map((scope, index) => [scope.id, index]));
  return {
    scopes: (wanted as ApiScope[]).sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)),
  };
}

/** Every scope still valid for the key: granted, and not above the owner's role today. */
export function effectiveScopes(scopes: ApiScope[], role: RoleId): ApiScope[] {
  const allowed = new Set(grantableScopes(role));
  return scopes.filter((scope) => allowed.has(scope));
}

export function apiKeyNameError(name: string): string | null {
  const value = name.replace(/\s+/g, " ").trim();
  if (value.length < 2) return "Give the key a name of at least 2 characters.";
  if (value.length > 60) return "Keep the key name under 60 characters.";
  return null;
}
