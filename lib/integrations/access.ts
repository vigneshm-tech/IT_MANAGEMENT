import type { RoleId } from "../roles";

/**
 * Who may save the Action1 API credentials. The connection is organisation-wide
 * (see `supabase/migrations/0016_action1_shared_credential.sql`), so exactly the
 * roles that run the servers module can write it.
 */
const ACTION1_MANAGERS: RoleId[] = ["super_admin", "it_manager", "it_engineer"];

export function canManageAction1(role: RoleId): boolean {
  return ACTION1_MANAGERS.includes(role);
}

export type IntegrationProviderKey = "redmine" | "action1";

/**
 * Storage slot for a credential. Redmine keys are per profile; Action1 has one
 * organisation slot, so a key saved by the IT manager is the one the whole team
 * reads.
 */
export function integrationSlot(userId: string, provider: IntegrationProviderKey): string {
  return provider === "action1" ? "organisation:action1" : `${userId}:${provider}`;
}
