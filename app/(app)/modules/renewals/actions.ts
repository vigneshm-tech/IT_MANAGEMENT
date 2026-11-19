"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/access";
import { requiredText, type FormState } from "@/lib/forms";
import {
  createRenewal,
  markRenewalRenewed,
  type RenewalRecord,
} from "@/lib/records/repository";
import { isRoleId } from "@/lib/roles";

const CURRENCIES = ["INR", "USD", "EUR"] as const;

export async function createRenewalAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "renewals", "edit")) {
    return { error: "You don’t have permission to add renewals." };
  }

  const item = requiredText(formData, "item", 2);
  const vendor = String(formData.get("vendor") ?? "").trim();
  const clientName = String(formData.get("clientName") ?? "").trim();
  const amount = Number(formData.get("amount") ?? 0);
  const currency = String(formData.get("currency") ?? "INR");
  const renewalDate = String(formData.get("renewalDate") ?? "");
  const noticeDays = Number(formData.get("noticeDays") ?? 30);
  const ownerRole = String(formData.get("ownerRole") ?? "");

  if (!item) return { error: "Enter the renewal item." };
  if (!Number.isFinite(amount) || amount < 0) return { error: "Enter a valid amount." };
  if (!renewalDate) return { error: "Choose the renewal date." };
  if (!Number.isFinite(noticeDays) || noticeDays < 0 || noticeDays > 365) {
    return { error: "Notice period must be between 0 and 365 days." };
  }
  if (!CURRENCIES.includes(currency as (typeof CURRENCIES)[number])) {
    return { error: "Select a currency." };
  }
  if (!isRoleId(ownerRole)) return { error: "Select an owner." };

  try {
    const record = await createRenewal(user, {
      item,
      vendor,
      clientName,
      amount,
      currency: currency as RenewalRecord["currency"],
      renewalDate: new Date(`${renewalDate}T10:00:00+05:30`).toISOString(),
      noticeDays,
      ownerRole,
    });
    revalidatePath("/modules/renewals");
    revalidatePath("/modules/dashboard");
    return { ok: true, message: `${record.item} added.` };
  } catch (error) {
    console.error("[renewals] create failed", error);
    return { error: "The renewal could not be saved. Please try again." };
  }
}

export async function markRenewalRenewedAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "renewals", "edit")) return;

  const id = String(formData.get("id") ?? "");
  const value = String(formData.get("value") ?? "");
  if (!id || value !== "renew") return;

  await markRenewalRenewed(id);
  revalidatePath("/modules/renewals");
  revalidatePath("/modules/dashboard");
}
