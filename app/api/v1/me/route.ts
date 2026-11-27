import { apiRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiRoute(request, null, async (caller) =>
    ok({
      user: {
        id: caller.userId,
        name: caller.name,
        email: caller.email,
        role: caller.role,
      },
      key: {
        id: caller.keyId,
        name: caller.keyName,
        scopes: caller.scopes,
      },
    }),
  );
}
