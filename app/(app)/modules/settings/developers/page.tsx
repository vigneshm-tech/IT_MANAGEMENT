import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { AlertCircle, KeyRound, Terminal } from "lucide-react";
import { ApiKeyForm } from "@/components/modules/api-key-form";
import { AccessDenied } from "@/components/modules/access-denied";
import { SettingsTabs } from "@/components/modules/settings-tabs";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listApiKeys } from "@/lib/api/keys";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { API_SCOPES, grantableScopes } from "@/lib/api/scopes";
import { MCP_PROTOCOL_VERSION, MCP_TOOLS } from "@/lib/mcp/server";
import { listConnectedApps } from "@/lib/mcp/oauth";
import { recentMcpRequests } from "@/lib/mcp/log";
import { formatDateTime } from "@/lib/format";
import { createApiKeyAction, revokeApiKeyAction, revokeConnectedAppAction } from "./actions";

export const metadata: Metadata = { title: "Developers" };

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto border border-line bg-[#f7f9fc] px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-body">
      <code>{children}</code>
    </pre>
  );
}

function isLive(key: { revokedAt: string | null; expiresAt: string | null }) {
  return !key.revokedAt && (!key.expiresAt || new Date(key.expiresAt) > new Date());
}

export default async function DevelopersSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ revoke?: string }>;
}) {
  const user = await requireUser();
  if (!canAccessModule(user.role, "settings")) {
    return <AccessDenied moduleTitle="Settings" />;
  }

  const { revoke } = await searchParams;
  const [keys, apps, requests, headerList] = await Promise.all([
    listApiKeys(user.id),
    listConnectedApps(user.id),
    recentMcpRequests(8),
    headers(),
  ]);
  const host = headerList.get("host") ?? "localhost:3000";
  const origin = `${host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https"}://${host}`;

  const granting = grantableScopes(user.role);
  const available = API_SCOPES.filter((scope) => granting.includes(scope.id)).map((scope) => ({
    id: scope.id,
    label: scope.label,
    summary: scope.summary,
  }));
  const activeKeys = keys.filter(isLive);
  const liveApps = apps.filter(
    (app) => !app.revokedAt && new Date(app.expiresAt) > new Date(),
  );
  const confirming = revoke ? keys.find((key) => key.id === revoke && isLive(key)) : undefined;

  const sampleSecret = "tt_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

  return (
    <div className="space-y-5">
      <PageHeader title="Developers">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
          <SettingsTabs active="developers" />
          <p className="text-[12px] text-muted">
            {activeKeys.length === 0
              ? "No active keys"
              : `${activeKeys.length} active ${activeKeys.length === 1 ? "key" : "keys"}`}{" "}
            · {granting.length} of {API_SCOPES.length} scopes your role can grant ·{" "}
            {liveApps.length === 0
              ? "no connected apps"
              : `${liveApps.length} connected ${liveApps.length === 1 ? "app" : "apps"}`}
          </p>
        </div>
      </PageHeader>

      {confirming && (
        <section className="flex flex-wrap items-center justify-between gap-3 border border-[#eccfcd] bg-danger-soft px-4 py-2.5 text-danger">
          <p className="flex items-start gap-2 text-[12.5px]">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Revoke &quot;{confirming.name}&quot; ({confirming.prefix}…)? Anything using it stops
            working immediately. This cannot be undone.
          </p>
          <div className="flex items-center gap-2">
            <form action={revokeApiKeyAction}>
              <input type="hidden" name="id" value={confirming.id} />
              <Button type="submit" size="sm" variant="danger">
                Revoke key
              </Button>
            </form>
            <Link
              href="/modules/settings/developers"
              className="text-[11.5px] text-danger underline underline-offset-2"
            >
              Cancel
            </Link>
          </div>
        </section>
      )}

      <section aria-labelledby="keys-heading" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="keys-heading" className="text-[13px] font-semibold text-navy">
              Your keys
            </h2>
            <p className="mt-0.5 text-[11.5px] text-muted">
              A key is a second password for this account. It carries the owner&apos;s role, narrowed
              by its scopes — never widened.
            </p>
          </div>
        </div>

        {keys.length === 0 ? (
          <p className="border-y border-line bg-surface px-4 py-6 text-center text-[12.5px] text-muted">
            No keys yet. Issue one below when a script or an assistant needs to read tickets.
          </p>
        ) : (
          <div className="overflow-x-auto border-y border-line">
            <table className="w-full min-w-[820px] text-left text-[12px]">
              <thead>
                <tr className="border-b border-line bg-[#f7f9fc] text-[10.5px] uppercase tracking-[0.07em] text-muted">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Prefix</th>
                  <th className="px-3 py-2 font-medium">Scopes</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium">Last used</th>
                  <th className="px-3 py-2 font-medium">Expires</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {keys.map((key) => {
                  const live = isLive(key);
                  return (
                    <tr key={key.id} className="align-top">
                      <td className="px-3 py-2.5 font-medium text-navy">{key.name}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-muted">{key.prefix}…</td>
                      <td className="px-3 py-2.5 text-muted">
                        {key.scopes.length === 0 ? "—" : key.scopes.join(", ")}
                      </td>
                      <td className="px-3 py-2.5 text-muted">{formatDateTime(new Date(key.createdAt))}</td>
                      <td className="px-3 py-2.5 text-muted">
                        {key.lastUsedAt ? formatDateTime(new Date(key.lastUsedAt)) : "Never"}
                      </td>
                      <td className="px-3 py-2.5 text-muted">
                        {key.expiresAt ? formatDateTime(new Date(key.expiresAt)) : "Never"}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusPill
                          status={key.revokedAt ? "revoked" : live ? "active" : "expired"}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {live ? (
                          <Link
                            href={`/modules/settings/developers?revoke=${encodeURIComponent(key.id)}`}
                            className="text-[11.5px] text-danger underline-offset-2 hover:underline"
                          >
                            Revoke
                          </Link>
                        ) : (
                          <span className="text-[11.5px] text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <ApiKeyForm action={createApiKeyAction} scopes={available} />
      </section>

      <section aria-labelledby="log-heading" className="space-y-3">
        <div>
          <h2 id="log-heading" className="text-[13px] font-semibold text-navy">
            Recent MCP requests
          </h2>
          <p className="mt-0.5 text-[11.5px] text-muted">
            The last eight attempts to reach <code className="font-mono text-navy">{origin}/api/mcp</code>{" "}
            — verb, JSON-RPC method, status and one line of detail. A connector that says &quot;no tools
            loaded&quot; is one of these rows; the detail says which.
          </p>
        </div>

        {requests.length === 0 ? (
          <p className="border-y border-line bg-surface px-4 py-5 text-[12.5px] text-muted">
            Nothing has reached the endpoint yet. If you have just added the connector, its attempt will
            appear here within a second — an empty table means the request never arrived (wrong URL, or
            blocked before it reached the app).
          </p>
        ) : (
          <div className="overflow-x-auto border-y border-line">
            <table className="w-full min-w-[760px] text-left text-[12px]">
              <thead>
                <tr className="border-b border-line bg-[#f7f9fc] text-[10.5px] uppercase tracking-[0.07em] text-muted">
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Verb</th>
                  <th className="px-3 py-2 font-medium">Method</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Credential</th>
                  <th className="px-3 py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {requests.map((entry, index) => (
                  <tr key={`${entry.at}-${index}`} className="align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-muted">
                      {formatDateTime(new Date(entry.at))}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-navy">{entry.verb}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-body">
                      {entry.rpcMethod ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          entry.status < 300
                            ? "text-success"
                            : entry.status < 500
                              ? "text-warning"
                              : "text-danger"
                        }
                      >
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted">{entry.credential ?? "none"}</td>
                    <td className="px-3 py-2 text-muted">{entry.detail ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="apps-heading" className="space-y-3">
        <div>
          <h2 id="apps-heading" className="text-[13px] font-semibold text-navy">
            Connected apps
          </h2>
          <p className="mt-0.5 text-[11.5px] text-muted">
            Apps that connected themselves over OAuth and act as you until you revoke them. This is
            what a connector screen uses — it never sees a key.
          </p>
        </div>

        {liveApps.length === 0 ? (
          <p className="border-y border-line bg-surface px-4 py-5 text-[12.5px] text-muted">
            No app is connected. Add{" "}
            <code className="font-mono text-navy">{origin}/api/mcp</code> as an MCP connector and it
            will land on a consent screen instead of failing.
          </p>
        ) : (
          <div className="overflow-x-auto border-y border-line">
            <table className="w-full min-w-[720px] text-left text-[12px]">
              <thead>
                <tr className="border-b border-line bg-[#f7f9fc] text-[10.5px] uppercase tracking-[0.07em] text-muted">
                  <th className="px-3 py-2 font-medium">App</th>
                  <th className="px-3 py-2 font-medium">Scopes</th>
                  <th className="px-3 py-2 font-medium">Connected</th>
                  <th className="px-3 py-2 font-medium">Last used</th>
                  <th className="px-3 py-2 font-medium">Expires</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {liveApps.map((app) => (
                  <tr key={app.id} className="align-top">
                    <td className="px-3 py-2.5 font-medium text-navy">{app.clientName}</td>
                    <td className="px-3 py-2.5 text-muted">{app.scopes.join(", ") || "—"}</td>
                    <td className="px-3 py-2.5 text-muted">
                      {formatDateTime(new Date(app.createdAt))}
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {app.lastUsedAt ? formatDateTime(new Date(app.lastUsedAt)) : "Not yet"}
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {formatDateTime(new Date(app.expiresAt))}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <form action={revokeConnectedAppAction}>
                        <input type="hidden" name="id" value={app.id} />
                        <button
                          type="submit"
                          className="text-[11.5px] text-danger underline-offset-2 hover:underline"
                        >
                          Revoke
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11.5px] leading-relaxed text-muted">
          Revoking ends the app&apos;s access token and the refresh token beside it, so it cannot mint
          a new one on the next call. An app can also hold an access token that is simply left to
          expire — an hour is a short leash on purpose.
        </p>
      </section>

      <section aria-labelledby="api-heading" className="space-y-3">
        <div>
          <h2
            id="api-heading"
            className="flex items-center gap-1.5 text-[13px] font-semibold text-navy"
          >
            <Terminal className="h-3.5 w-3.5" aria-hidden />
            REST API
          </h2>
          <p className="mt-0.5 text-[11.5px] text-muted">
            Base URL <code className="font-mono text-navy">{origin}/api/v1</code> · authenticated
            with <code className="font-mono text-navy">Authorization: Bearer tt_…</code> (or{" "}
            <code className="font-mono text-navy">x-api-key</code>) · 120 requests a minute per key
          </p>
        </div>

        <div className="overflow-x-auto border-y border-line">
          <table className="w-full min-w-[640px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-line bg-[#f7f9fc] text-[10.5px] uppercase tracking-[0.07em] text-muted">
                <th className="px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 font-medium">Path</th>
                <th className="px-3 py-2 font-medium">Scope</th>
                <th className="px-3 py-2 font-medium">Returns</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-surface">
              {API_ENDPOINTS.map((endpoint) => {
                const allowed = endpoint.scope === null || granting.includes(endpoint.scope);
                return (
                  <tr key={`${endpoint.method} ${endpoint.path}`} className={allowed ? "" : "opacity-55"}>
                    <td className="px-3 py-2 font-mono text-[11px] text-navy">{endpoint.method}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-body">{endpoint.path}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted">
                      {endpoint.scope ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted">{endpoint.summary}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[11.5px] font-medium text-navy">A request</p>
            <Code>{`curl -s "${origin}/api/v1/tickets?limit=5" \\
  -H "Authorization: Bearer ${sampleSecret}"`}</Code>
          </div>
          <div>
            <p className="mb-1.5 text-[11.5px] font-medium text-navy">Its shape</p>
            <Code>{`{ "data": [ … ], "meta": { "count": 5 } }

{ "error": { "code": "invalid_filter",
             "message": "\\"done\\" is not a ticket state." } }`}</Code>
          </div>
        </div>
        <p className="text-[11.5px] leading-relaxed text-muted">
          Errors carry an HTTP status and one of a small set of codes —{" "}
          <code className="font-mono">unauthorized</code>, <code className="font-mono">forbidden</code>,{" "}
          <code className="font-mono">rate_limited</code>, <code className="font-mono">not_found</code>,{" "}
          <code className="font-mono">invalid_filter</code>, <code className="font-mono">invalid_ticket</code>.
          Rate-limit headers are <code className="font-mono">x-ratelimit-limit</code>,{" "}
          <code className="font-mono">x-ratelimit-remaining</code> and a{" "}
          <code className="font-mono">retry-after</code> when the answer is 429.
        </p>
      </section>

      <section aria-labelledby="mcp-heading" className="space-y-3">
        <div>
          <h2 id="mcp-heading" className="text-[13px] font-semibold text-navy">
            MCP server
          </h2>
          <p className="mt-0.5 text-[11.5px] text-muted">
            <code className="font-mono text-navy">{origin}/api/mcp</code> · JSON-RPC 2.0 over POST ·
            protocol <code className="font-mono text-navy">{MCP_PROTOCOL_VERSION}</code> · OAuth 2.1
            or a personal key, the same scopes either way
          </p>
        </div>

        <div className="border border-line bg-surface">
          <div className="border-b border-line px-4 py-2.5">
            <p className="text-[12px] font-medium text-navy">If your client has a connector screen</p>
          </div>
          <div className="space-y-3 px-4 py-3 text-[11.5px] leading-relaxed text-muted">
            <p>
              Paste <code className="font-mono text-navy">{origin}/api/mcp</code> as the server URL and
              leave authentication empty. The client registers itself, sends you to a consent screen on
              this deployment, and gets a short-lived token — no key to copy. Its metadata lives at{" "}
              <code className="font-mono">/.well-known/oauth-authorization-server</code> and{" "}
              <code className="font-mono">/.well-known/oauth-protected-resource</code>.
            </p>
            <p>
              If the dialog asks you for headers instead, either row below works — same key, two
              spellings. Use the first if the client hides or overwrites{" "}
              <code className="font-mono">Authorization</code>.
            </p>
            <div className="overflow-x-auto border border-line">
              <table className="w-full min-w-[420px] text-left text-[11.5px]">
                <thead>
                  <tr className="border-b border-line bg-[#f7f9fc] text-[10px] uppercase tracking-[0.07em] text-muted">
                    <th className="px-2.5 py-1.5 font-medium">Header name</th>
                    <th className="px-2.5 py-1.5 font-medium">Value</th>
                    <th className="px-2.5 py-1.5 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  <tr>
                    <td className="px-2.5 py-1.5 font-mono text-navy">X-TaskTornado-Key</td>
                    <td className="px-2.5 py-1.5 font-mono text-body">tt_…</td>
                    <td className="px-2.5 py-1.5 text-muted">
                      App-specific; nothing can silently replace it
                    </td>
                  </tr>
                  <tr>
                    <td className="px-2.5 py-1.5 font-mono text-navy">Authorization</td>
                    <td className="px-2.5 py-1.5 font-mono text-body">Bearer tt_…</td>
                    <td className="px-2.5 py-1.5 text-muted">
                      The standard; <code className="font-mono">tt_…</code> alone also works
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              <code className="font-mono">X-TaskTornado-Api-Key</code> and{" "}
              <code className="font-mono">X-TaskTornado-Token</code> are accepted too, as are{" "}
              <code className="font-mono">X-Api-Key</code> and <code className="font-mono">Api-Key</code>{" "}
              — the value is the credential either way.
            </p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="mb-1.5 text-[11.5px] font-medium text-navy">
              If your client takes a config file (key)
            </p>
            <Code>{`{
  "mcpServers": {
    "tasktornado": {
      "type": "http",
      "url": "${origin}/api/mcp",
      "headers": {
        "Authorization": "Bearer ${sampleSecret}"
      }
    }
  }
}`}</Code>
          </div>
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-[11.5px] font-medium text-navy">Tools</p>
              <ul className="divide-y divide-line border-y border-line bg-surface">
                {MCP_TOOLS.map((tool) => {
                  const allowed = granting.includes(tool.scope);
                  return (
                    <li
                      key={tool.name}
                      className={`flex items-baseline justify-between gap-3 px-3 py-1.5 ${allowed ? "" : "opacity-55"}`}
                    >
                      <span className="font-mono text-[11.5px] text-navy">{tool.name}</span>
                      <span className="font-mono text-[10.5px] text-muted">{tool.scope}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <p className="text-[11.5px] leading-relaxed text-muted">
              Tools a key cannot use are hidden from <code className="font-mono">tools/list</code> and
              refused by <code className="font-mono">tools/call</code>: the assistant is never told a
              capability exists and then turned away. Nothing here reads more than the REST API would —
              a second shape, not a second door.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
