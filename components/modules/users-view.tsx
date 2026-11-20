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
import { RecordDialog, type FieldDef } from "@/components/ui/record-dialog";
import { StatusPill, humanise } from "@/components/ui/status-pill";
import { UsersTabs } from "@/components/modules/users-tabs";
import { ROLE_BY_ID, VISIBLE_ROLES } from "@/lib/roles";
import type { DirectoryUser } from "@/lib/users/repository";
import { createUserAction, updateUserAction } from "@/app/(app)/modules/users/actions";

const COLUMNS: Column[] = [
  { key: "name", label: "Name", width: "22%" },
  { key: "email", label: "Email", type: "muted", width: "26%" },
  { key: "title", label: "Job title", type: "muted", width: "20%" },
  { key: "role", label: "Access level", width: "18%" },
  { key: "status", label: "Status", type: "status", width: "14%" },
];

const ADD_FIELDS: FieldDef[] = [
  {
    name: "fullName",
    label: "Full name",
    type: "text",
    required: true,
    placeholder: "Priya Raman",
  },
  {
    name: "email",
    label: "Work email",
    type: "email",
    required: true,
    placeholder: "priya.raman@company.com",
  },
  {
    name: "title",
    label: "Job title",
    type: "text",
    placeholder: "IT Support Engineer",
  },
  {
    name: "role",
    label: "Access level",
    type: "select",
    required: true,
    options: VISIBLE_ROLES.map((role) => ({ value: role.id, label: role.label })),
  },
  {
    name: "password",
    label: "Temporary password",
    type: "password",
    required: true,
    placeholder: "At least 8 characters",
  },
];

function roleLabel(role: DirectoryUser["role"]): string {
  if (!role) return "Unassigned";
  const entry = ROLE_BY_ID[role];
  if (!entry || entry.hidden) return "Unassigned";
  return entry.label;
}

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
  error,
  currentUserId,
}: {
  users: DirectoryUser[];
  error: string | null;
  currentUserId: string;
}) {
  const [viewing, setViewing] = useState<DirectoryUser | null>(null);

  const rows = useMemo<TableRow[]>(
    () =>
      users.map((user) => {
        const self = user.id === currentUserId;
        const actions: RowAction[] = [];

        if (!self) {
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
            email: user.email,
            title: user.title || "—",
            role: roleLabel(user.role),
            status: user.status,
          },
          actions,
        };
      }),
    [users, currentUserId],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users & Groups"
        actions={
          <RecordDialog
            title="Add user"
            triggerLabel="Add user"
            submitLabel="Add user"
            fields={ADD_FIELDS}
            action={createUserAction}
            size="lg"
          />
        }
      >
        <UsersTabs active="users" />
      </PageHeader>

      <DataTable
        columns={COLUMNS}
        rows={rows}
        tableId="users"
        exportName="tasktornado-users"
        pageSize={10}
        rowAction={updateUserAction}
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
            <Detail label="Full name" value={viewing.name} />
            <Detail label="Work email" value={viewing.email || "—"} />
            <Detail label="Job title" value={viewing.title || "—"} />
            <Detail label="Access level" value={roleLabel(viewing.role)} />
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
