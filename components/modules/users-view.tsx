"use client";

import { Users } from "lucide-react";
import { useMemo } from "react";
import { DataTable, type TableRow } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { DirectoryUser } from "@/lib/users/repository";
import { ROLE_BY_ID } from "@/lib/roles";

const COLUMNS = [
  { key: "name", label: "Name", width: "22%" },
  { key: "email", label: "Email", type: "muted" as const, width: "26%" },
  { key: "title", label: "Job title", type: "muted" as const, width: "20%" },
  { key: "role", label: "Access level", width: "18%" },
  { key: "status", label: "Status", type: "status" as const, width: "14%" },
];

function roleLabel(role: DirectoryUser["role"]): string {
  if (!role) return "Unassigned";
  const entry = ROLE_BY_ID[role];
  if (!entry || entry.hidden) return "Unassigned";
  return entry.label;
}

export function UsersView({
  users,
  error,
}: {
  users: DirectoryUser[];
  error: string | null;
}) {
  const rows = useMemo<TableRow[]>(
    () =>
      users.map((user) => ({
        id: user.id,
        cells: {
          name: user.name,
          email: user.email,
          title: user.title || "—",
          role: roleLabel(user.role),
          status: user.status,
        },
      })),
    [users],
  );

  const active = users.filter((user) => user.status === "active").length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        meta={
          <span className="text-[12.5px] text-muted">
            {users.length} {users.length === 1 ? "account" : "accounts"} · {active} active
          </span>
        }
        description="Every employee profile, with the access level assigned by the role catalogue. Search by name, email, title or role."
      />

      <DataTable
        columns={COLUMNS}
        rows={rows}
        pageSize={10}
        searchPlaceholder="Search people, emails or access levels"
        emptyState={
          <EmptyState
            icon={Users}
            title={error ?? "No accounts found"}
            description={
              error
                ? "The directory could not be read. Reload the page, or check the database connection."
                : "Profiles appear here as soon as they are provisioned. Accounts without an access level are shown as unassigned."
            }
          />
        }
      />
    </div>
  );
}
