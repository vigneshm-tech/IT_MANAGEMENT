import { DEMO_USERS } from "../demo-users";
import { normalizeGroupName, type UserGroup, type UserGroupMember } from "./groups";

/**
 * In-memory groups for demo mode (no Supabase configured).
 *
 * Preview builds have no database, so groups live in process memory exactly as
 * the directory does in `store.ts`. Membership is stored as account ids and
 * resolved to names on read, so a renamed account keeps its groups.
 */
type DemoGroup = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  memberIds: string[];
};

let groups: DemoGroup[] | null = null;
let counter = 0;

function seed(): DemoGroup[] {
  const now = new Date().toISOString();
  return [
    {
      id: "g-service-desk",
      name: "Service Desk",
      description: "First-line triage for incoming tickets",
      createdAt: now,
      memberIds: ["u-l2-manager", "u-l2-lead", "u-l2-engineer"],
    },
    {
      id: "g-infrastructure",
      name: "Infrastructure",
      description: "Servers, patching and endpoint compliance",
      createdAt: now,
      memberIds: ["u-it-manager", "u-it-engineer"],
    },
    {
      id: "g-delivery-leads",
      name: "Delivery Leads",
      description: "Implementation, development and testing leads",
      createdAt: now,
      memberIds: ["u-impl-lead", "u-dev-lead", "u-qa-lead"],
    },
  ];
}

function rows(): DemoGroup[] {
  if (!groups) groups = seed();
  return groups;
}

function resolve(memberIds: string[]): UserGroupMember[] {
  return memberIds
    .map((id) => DEMO_USERS.find((user) => user.id === id))
    .filter((user): user is (typeof DEMO_USERS)[number] => Boolean(user))
    .map((user) => ({ id: user.id, name: user.name, email: user.email, role: user.role }));
}

function present(group: DemoGroup): UserGroup {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    createdAt: group.createdAt,
    members: resolve(group.memberIds),
  };
}

export function listDemoGroups(): UserGroup[] {
  return rows()
    .map(present)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function createDemoGroup(input: { name: string; description: string }): UserGroup {
  counter += 1;
  const group: DemoGroup = {
    id: `g-demo-${counter}`,
    name: normalizeGroupName(input.name),
    description: input.description,
    createdAt: new Date().toISOString(),
    memberIds: [],
  };
  rows().push(group);
  return present(group);
}

export function deleteDemoGroup(id: string): boolean {
  const all = rows();
  const index = all.findIndex((group) => group.id === id);
  if (index === -1) return false;
  all.splice(index, 1);
  return true;
}

export function addDemoGroupMember(groupId: string, userId: string): boolean {
  const group = rows().find((entry) => entry.id === groupId);
  if (!group) return false;
  if (!DEMO_USERS.some((user) => user.id === userId)) return false;
  if (group.memberIds.includes(userId)) return false;
  group.memberIds.push(userId);
  return true;
}

export function removeDemoGroupMember(groupId: string, userId: string): boolean {
  const group = rows().find((entry) => entry.id === groupId);
  if (!group) return false;
  const index = group.memberIds.indexOf(userId);
  if (index === -1) return false;
  group.memberIds.splice(index, 1);
  return true;
}
