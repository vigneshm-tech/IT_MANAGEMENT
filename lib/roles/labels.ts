/**
 * Names for workspace-defined roles.
 *
 * A role called "Warehouse Supervisor" has the key `warehouse_supervisor`.
 * Turning the key back into words gives "Warehouse Supervisor" almost always —
 * but not when the administrator typed "Floor lead (warehouse)", so the last
 * catalogue read keeps the real names where a synchronous lookup can find them.
 *
 * No imports on purpose: `lib/roles.ts` reads this and must stay a leaf module.
 */

let labels: Record<string, string> = {};

export function setRoleLabels(next: { id: string; label: string }[]): void {
  labels = Object.fromEntries(next.map((role) => [role.id, role.label]));
}

export function clearRoleLabels(): void {
  labels = {};
}

export function roleLabelOverride(id: string): string | null {
  return labels[id] ?? null;
}
