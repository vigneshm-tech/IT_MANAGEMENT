"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  disconnectIntegration,
  saveIntegration,
  type IntegrationProvider,
} from "@/lib/integrations/store";
import { normaliseAction1BaseUrl } from "@/lib/integrations/action1";
import { canManageAction1 } from "@/lib/integrations/access";

export type IntegrationState = {
  ok?: boolean;
  error?: string;
  message?: string;
};

const PROVIDERS: IntegrationProvider[] = ["redmine", "action1"];

function providerFrom(value: string): IntegrationProvider | null {
  return PROVIDERS.includes(value as IntegrationProvider)
    ? (value as IntegrationProvider)
    : null;
}

export async function saveIntegrationAction(
  _previous: IntegrationState,
  formData: FormData,
): Promise<IntegrationState> {
  const user = await requireUser();
  const provider = providerFrom(String(formData.get("provider") ?? ""));
  const secret = String(formData.get("secret") ?? "").trim();
  const baseUrl = String(formData.get("baseUrl") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const orgId = String(formData.get("orgId") ?? "").trim();

  if (!provider) {
    return { error: "Unknown integration." };
  }
  if (secret.length < 12) {
    return { error: "That API key looks too short. Paste the full key." };
  }
  if (provider === "redmine") {
    if (!/^https?:\/\/.+/i.test(baseUrl)) {
      return { error: "Enter your Redmine URL, including https://." };
    }
  }
  if (provider === "action1") {
    if (!canManageAction1(user.role)) {
      return { error: "Only IT can configure the Action1 key." };
    }
    if (clientId.length < 4) {
      return { error: "Enter the Action1 client id that goes with this secret." };
    }
    if (baseUrl && !/^https?:\/\/.+/i.test(baseUrl)) {
      return { error: "Enter the API address, including https://." };
    }
  }

  try {
    await saveIntegration(user.id, {
      provider,
      secret,
      // Action1 stores its console address (normalised to .../api/3.0) and the
      // non-secret client/organization ids alongside the encrypted secret.
      baseUrl:
        provider === "redmine" ? baseUrl : normaliseAction1BaseUrl(baseUrl),
      config: provider === "action1" ? { clientId, orgId } : undefined,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "The key could not be saved. Please try again.",
    };
  }

  revalidatePath("/modules/settings");
  revalidatePath("/modules/tickets");
  revalidatePath("/modules/servers");

  return {
    ok: true,
    message:
      provider === "redmine"
        ? "Redmine key saved to your profile."
        : "Action1 credentials saved. The server inventory will refresh now.",
  };
}

export async function disconnectIntegrationAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const provider = providerFrom(String(formData.get("provider") ?? ""));
  if (!provider) return;
  if (provider === "action1" && !canManageAction1(user.role)) return;
  await disconnectIntegration(user.id, provider);
  revalidatePath("/modules/settings");
  revalidatePath("/modules/tickets");
  revalidatePath("/modules/servers");
}
