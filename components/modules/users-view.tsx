"use client";

import { Users } from "lucide-react";
import { useMemo, useState } from "react";
import {
  DataTable,
  type Column,
  type RowAction,
  type TableRow,
} from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill, humanise } from "@/components/ui/status-pill";
import { UsersTabs } from "@/components/modules/users-tabs";
import { UserForm } from "@/components/modules/user-form";
import { buttonClass } from "@/components/ui/button";
import { roleOf } from "@/lib/roles";
import type { RoleOption } from "@/lib/roles/types";
import type { DirectoryUser } from "@/lib/users/repository";
import type { UserGroup } from "@/lib/users/groups";
import { createUserAction, updateUserAction } from "@/app/(app)/modules/users/actions";

const COLUMNS: Column[] = [
  { key: "name", label: "Employee", width: "22%" },
  { key: "employeeId", label: "Employee ID", type: "muted", width: "14%" },
  { key: "email", label: "Work email", type: "muted", width: "24%" },
  { key: "title", label: "Designation", type: "muted", width: "16%" },
  { key: "role", label: "Access level", width: "14%" },
  { key: "status", label: "Status", type: "status", width: "10%" },
];

/* Workspace roles are not in the browser's copy of the catalogue, so the server
 * sends the list and every label here resolves against it. */

function lastSeen(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export function UsersView({
  users,
  groups,
  roles,
  error,
  currentUserId,
  canManage,
  visibleTabs,
}: {
  users: DirectoryUser[];
  groups: Pick<UserGroup, "id" | "name" | "members">[];
  roles: RoleOption[];
  error: string | null;
  currentUserId: string;
  /** Write on Users & Groups. Without it the directory is a list, not a tool. */
  canManage: boolean;
  /** The Users & Groups pages this role was granted — the tabs to draw. */
  visibleTabs: string[];
}) {
  const roleLabel = (role: DirectoryUser["role"]): string => {
    if (!role) return "Unassigned";
    const entry = roles.find((option) => option.id === role);
    if (entry) return entry.label;
    const known = roleOf(role);
    return known.hidden ? "Unassigned" : known.label;
  };
  const [viewing, setViewing] = useState<DirectoryUser | null>(null);
  const [adding, setAdding] = useState(false);

  const groupOptions = useMemo(
    () => groups.map((group) => ({ id: group.id, name: group.name })),
    [groups],
  );

  const groupsOf = (userId: string) =>
    groups
      .filter((group) => group.members.some((member) => member.id === userId))
      .map((group) => group.name)
      .join(", ");

  const rows = useMemo<TableRow[]>(
    () =>
      users.map((user) => {
        const self = user.id === currentUserId;
        const actions: RowAction[] = [];

        if (!self && canManage) {
          actions.push(
            user.status === "suspended"
              ? { label: "Reactivate", value: "activate", tone: "primary" }
              : { label: "Suspend", value: "suspend" },
          );
          actions.push({
            label: "Delete",
            value: "delete",
            tone: "danger",
            confirm: `Delete ${user.name}? The account is removed permanently and cannot be restored.`,
          });
        }

        return {
          id: user.id,
          cells: {
            name: user.name,
            employeeId: user.employeeId || "—",
            email: user.email,
            title: user.title || "—",
            role: roleLabel(user.role),
            status: user.status,
          },
          actions,
        };
      }),
    [users, currentUserId, roles, canManage],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users & Groups"
        actions={
          canManage ? (
            <button
              type="button"
              onClick={() => setAdding((value) => !value)}
              className={buttonClass({ size: "sm" })}
            >
              Add user
            </button>
          ) : undefined
        }
      >
        <UsersTabs active="users" visible={visibleTabs} />
      </PageHeader>

      {adding && canManage && (
        <UserForm groups={groupOptions} roles={roles} onClose={() => setAdding(false)} />
      )}

      <DataTable
        columns={COLUMNS}
        rows={rows}
        tableId="users"
        exportName="tasktornado-users"
        pageSize={10}
        rowAction={canManage ? updateUserAction : undefined}
        searchPlaceholder="Search people, emails or access levels"
        renderRowExtras={(row) => {
          const user = users.find((entry) => entry.id === row.id);
          if (!user) return null;
          return (
            <button
              type="button"
              onClick={() => setViewing(user)}
              className="rounded px-2 py-1 text-[11.5px] font-medium text-navy transition-colors hover:bg-[#eef2f8]"
            >
              View
            </button>
          );
        }}
        emptyState={
          <EmptyState
            icon={Users}
            title={error ?? "No accounts found"}
            description={error ? "Reload the page to try again." : undefined}
          />
        }
      />

      <Dialog
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing ? viewing.name : "User"}
        size="md"
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setViewing(null)}
              className="inline-flex h-8 items-center rounded-md border border-line-strong bg-surface px-3 text-[12px] font-medium text-navy transition hover:bg-[#f2f5fa]"
            >
              Close
            </button>
          </div>
        }
      >
        {viewing && (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Detail label="Employee name" value={viewing.name} />
            <Detail label="Employee ID" value={viewing.employeeId || "—"} />
            <Detail label="Work email" value={viewing.email || "—"} />
            <Detail label="Designation" value={viewing.title || "—"} />
            <Detail label="Access level" value={roleLabel(viewing.role)} />
            <Detail label="Access group" value={groupsOf(viewing.id) || "—"} />
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                Status
              </dt>
              <dd className="mt-1">
                <StatusPill status={viewing.status} label={humanise(viewing.status)} />
              </dd>
            </div>
            <Detail label="Last sign-in" value={lastSeen(viewing.lastLoginAt)} />
          </dl>
        )}
      </Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{label}</dt>
      <dd className="mt-1 break-words text-[13px] text-navy">{value}</dd>
    </div>
  );
}
