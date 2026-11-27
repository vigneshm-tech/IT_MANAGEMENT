import { DEMO_USERS } from "../demo-users";
import type { RoleId } from "../roles";
import type { TaskWindowSettings } from "../task-window";
import type { DirectoryUser } from "./repository";

/**
 * In-memory directory for demo mode (no Supabase configured).
 *
 * Preview builds have no database, so the Users module keeps its accounts in
 * process memory: adds, suspensions and deletions behave exactly like the
 * Supabase flow until the server restarts. This mirrors `lib/tasks/store.ts`.
 */
let directory: DirectoryUser[] | null = null;
let counter = 0;

function seed(): DirectoryUser[] {
  return DEMO_USERS.filter((user) => user.role !== "super_admin").map((user, index) => ({
    id: user.id,
    employeeId: `EMP-${1001 + index}`,
    name: user.name,
    email: user.email,
    title: user.title,
    role: user.role,
    status: "active",
    lastLoginAt: null,
    taskWindow: null,
  }));
}

function users(): DirectoryUser[] {
  if (!directory) directory = seed();
  return directory;
}

export function listDemoDirectory(): DirectoryUser[] {
  return users().map((user) => ({ ...user }));
}

export function findDemoDirectoryUser(id: string): DirectoryUser | null {
  return users().find((user) => user.id === id) ?? null;
}

export function demoEmailTaken(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return users().some((user) => user.email.toLowerCase() === normalized);
}

export function demoEmployeeIdTaken(employeeId: string): boolean {
  const normalized = employeeId.trim().toUpperCase();
  return users().some((user) => user.employeeId.trim().toUpperCase() === normalized);
}

export function createDemoUser(input: {
  name: string;
  employeeId: string;
  email: string;
  title: string;
  role: RoleId;
  taskWindow?: TaskWindowSettings | null;
}): DirectoryUser {
  counter += 1;
  const user: DirectoryUser = {
    id: `u-demo-${counter}`,
    employeeId: input.employeeId.trim().toUpperCase(),
    name: input.name,
    email: input.email.trim().toLowerCase(),
    title: input.title,
    role: input.role,
    status: "active",
    lastLoginAt: null,
    taskWindow: input.taskWindow ?? null,
  };
  users().unshift(user);
  return { ...user };
}

export function setDemoUserStatus(id: string, status: DirectoryUser["status"]): boolean {
  const user = users().find((entry) => entry.id === id);
  if (!user) return false;
  user.status = status;
  return true;
}

export function removeDemoUser(id: string): boolean {
  const index = users().findIndex((entry) => entry.id === id);
  if (index === -1) return false;
  users().splice(index, 1);
  return true;
}
