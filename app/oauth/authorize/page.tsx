import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { getSession } from "@/lib/auth/session";
import { API_SCOPES } from "@/lib/api/scopes";
import { ROLE_BY_ID } from "@/lib/roles";
import { consentScopes, getClient, redirectUriError } from "@/lib/mcp/oauth";

export const metadata: Metadata = { title: "Connect an app" };

type Params = {
  client_id?: string;
  redirect_uri?: string;
  response_type?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
  state?: string;
  error?: string;
};

function Invalid({ reason }: { reason: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-md border border-line bg-surface px-6 py-7">
        <Wordmark height={20} />
        <h1 className="mt-4 text-[17px] font-semibold text-navy">This connection request is not valid</h1>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{reason}</p>
        <p className="mt-4 text-[12px] text-muted">
          Nothing was granted. A client must register itself and send a redirect address it owns.
        </p>
        <Link
          href="/modules/settings/developers"
          className="mt-4 inline-block text-[12px] text-navy underline underline-offset-2"
        >
          Open Settings → Developers
        </Link>
      </div>
    </main>
  );
}

/**
 * The consent screen.
 *
 * Deliberately not a full app page: it is the moment somebody decides whether an
 * assistant may read their tickets, so it shows the client, the scopes it asked
 * for, and nothing else. The session cookie is the only credential involved — the
 * app never sees a password.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const session = await getSession();

  if (!session) {
    // Sign in first, then come back to this exact consent request.
    const next = `/oauth/authorize?${new URLSearchParams(params as Record<string, string>).toString()}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  if (params.error) {
    return <Invalid reason={`The client reported "${params.error}".`} />;
  }

  const clientId = params.client_id ?? "";
  const redirectUri = params.redirect_uri ?? "";
  if (params.response_type !== "code") {
    return <Invalid reason="Only the authorization-code flow is supported (response_type=code)." />;
  }

  const client = await getClient(clientId);
  if (!client) {
    return <Invalid reason="The client is not registered with this deployment." />;
  }
  if (!redirectUri || redirectUriError(redirectUri) || !client.redirectUris.includes(redirectUri)) {
    return <Invalid reason="The redirect address does not belong to this client." />;
  }
  if (!params.code_challenge || params.code_challenge.length < 43) {
    return <Invalid reason="PKCE is required: this request has no usable code_challenge." />;
  }
  if (params.code_challenge_method && params.code_challenge_method !== "S256") {
    return <Invalid reason="Only the S256 PKCE method is supported." />;
  }

  const resolved = consentScopes(params.scope ?? "", session.role);
  if ("error" in resolved) {
    return <Invalid reason={resolved.error} />;
  }

  const scopes = API_SCOPES.filter((scope) => resolved.scopes.includes(scope.id));
  const role = ROLE_BY_ID[session.role];

  const hidden = {
    client_id: client.clientId,
    redirect_uri: redirectUri,
    code_challenge: params.code_challenge ?? "",
    scope: resolved.scopes.join(" "),
    state: params.state ?? "",
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-lg border border-line bg-surface">
        <div className="border-b border-line px-6 py-5">
          <Wordmark height={20} />
          <h1 className="mt-4 text-[17px] font-semibold text-navy">
            Connect &ldquo;{client.name}&rdquo;
          </h1>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            It is asking for access to your TaskTornado workspace. It will act as{" "}
            <span className="font-medium text-navy">{session.name}</span> ({role.label}), and can never
            do more than that access level allows.
          </p>
        </div>

        <div className="px-6 py-5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
            It will be able to
          </p>
          {scopes.length === 0 ? (
            <p className="mt-2 border border-[#ecd9b6] bg-warning-soft px-3 py-2 text-[12px] text-[#7b5c1d]">
              Nothing: your role cannot grant any of the scopes requested. Connecting would produce an
              app that always fails.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {scopes.map((scope) => (
                <li key={scope.id} className="flex items-start gap-2.5 py-2">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-navy-soft" aria-hidden />
                  <span>
                    <span className="block text-[12.5px] text-body">{scope.label}</span>
                    <span className="block text-[11px] text-muted">{scope.summary}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex items-center justify-between gap-3 text-[11.5px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <KeyRound className="h-3 w-3" aria-hidden />
              One app, one approval — revocable any time
            </span>
            <StatusPill status="active" label={role.label} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-[#f7f9fc] px-6 py-3.5">
          <form action="/oauth/authorize/decide" method="post">
            {Object.entries(hidden).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <input type="hidden" name="decision" value="deny" />
            <Button type="submit" variant="ghost" size="sm">
              Deny
            </Button>
          </form>
          <form action="/oauth/authorize/decide" method="post">
            {Object.entries(hidden).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <input type="hidden" name="decision" value="allow" />
            <Button type="submit" size="sm" disabled={scopes.length === 0}>
              Allow access
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
