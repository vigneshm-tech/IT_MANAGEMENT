"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  disconnectIntegration,
  saveIntegration,
  type IntegrationProvider,
} from "@/lib/integrations/store";

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
  if (provider === "action1" && !["it_manager", "it_engineer"].includes(user.role)) {
    return { error: "Only IT can configure the Action1 key." };
  }

  try {
    await saveIntegration(user.id, {
      provider,
      secret,
      baseUrl: provider === "redmine" ? baseUrl : undefined,
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
        : "Action1 key saved to your profile.",
  };
}

export async function disconnectIntegrationAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const provider = providerFrom(String(formData.get("provider") ?? ""));
  if (!provider) return;
  if (provider === "action1" && !["it_manager", "it_engineer"].includes(user.role)) return;
  await disconnectIntegration(user.id, provider);
  revalidatePath("/modules/settings");
  revalidatePath("/modules/tickets");
  revalidatePath("/modules/servers");
}
