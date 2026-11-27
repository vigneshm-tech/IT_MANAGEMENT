import { GET as authorizationServer } from "../oauth-authorization-server/route";

export const dynamic = "force-dynamic";

/**
 * Some clients look for `openid-configuration` before anything else, because
 * that is the name they know. This deployment is not an OpenID provider, but the
 * endpoints it publishes are the same ones, so pointing at the same document is
 * more useful than a 404 that reads as "no authorisation server here".
 */
export function GET(request: Request) {
  return authorizationServer(request);
}
