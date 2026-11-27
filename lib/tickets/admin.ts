/**
 * Who configures the ticket queues, promises, triggers and channel.
 *
 * The registers used to live under Masters, so the rule is the one that already
 * governed them: whoever may edit master data may edit these, plus the platform
 * owner and the IT manager through the tickets module. Defining it once here
 * keeps the pages and the actions from drifting apart, exactly as
 * `is_ticket_agent()` does on the database side.
 */

import { can } from "../access";
import type { RoleId } from "../roles";

export function canConfigureTickets(role: RoleId): boolean {
  return can(role, "masters", "edit") || can(role, "tickets", "admin");
}

/** Agents read the registers; only the roles above change them. */
export function canReadTicketAdmin(role: RoleId): boolean {
  return can(role, "tickets", "edit") || canConfigureTickets(role);
}
