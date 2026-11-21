"use client";

import { UsersRound, X } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UsersTabs } from "@/components/modules/users-tabs";
import { formatDateTime } from "@/lib/format";
import { candidatesFor, GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX, memberLabel, type UserGroup } from "@/lib/users/groups";
import {
  addGroupMemberAction,
  createGroupAction,
  deleteGroupAction,
  removeGroupMemberAction,
} from "@/app/(app)/modules/users/groups/actions";

const fieldClass =
  "h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-[13px] text-navy outline-none transition-colors focus:border-navy focus:ring-2 focus:ring-navy/10";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
      {children}
    </span>
  );
}

export function UserGroupsView({
  groups,
  error,
  people,
  canManage,
}: {
  groups: UserGroup[];
  error: string | null;
  people: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(createGroupAction, {});

  useEffect(() => {
    if (state.ok) setCreating(false);
  }, [state.ok]);

  const open = useMemo(
    () => groups.find((group) => group.id === openId) ?? null,
    [groups, openId],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users & Groups"
        actions={
          canManage ? (
            <button
              type="button"
              onClick={() => setCreating((value) => !value)}
              className={buttonClass({ size: "sm" })}
            >
              New group
            </button>
          ) : undefined
        }
      >
        <UsersTabs active="groups" />
      </PageHeader>

      {creating && canManage && (
        <form action={formAction} className="border border-line bg-surface">
          <div className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto] sm:items-end">
            <label className="block">
              <Label>Group name</Label>
              <input
                name="name"
                required
                maxLength={GROUP_NAME_MAX}
                placeholder="Service Desk"
                className={fieldClass}
              />
            </label>
            <label className="block">
              <Label>Description (optional)</Label>
              <input
                name="description"
                maxLength={GROUP_DESCRIPTION_MAX}
                placeholder="First-line triage for incoming tickets"
                className={fieldClass}
              />
            </label>
            <div className="flex items-center gap-2">
              <button type="submit" disabled={pending} className={buttonClass({ size: "sm" })}>
                {pending ? "Adding…" : "Add group"}
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className={buttonClass({ variant: "ghost", size: "sm" })}
              >
                Cancel
              </button>
            </div>
          </div>
          {state.error && (
            <p className="border-t border-line px-4 py-2 text-[12px] text-danger">{state.error}</p>
          )}
        </form>
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={error ?? "No groups yet"}
          description={error ? undefined : canManage ? "Create a group to organise the directory." : undefined}
          action={
            !error && canManage && !creating ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className={buttonClass({ size: "sm" })}
              >
                New group
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="border border-line bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Group</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => {
                const expanded = group.id === openId;
                const candidates = candidatesFor(group, people);

                return [
                  <TableRow key={group.id} data-state={expanded ? "selected" : undefined}>
                    <TableCell>
                      <span className="font-medium text-navy">{group.name}</span>
                      {group.description && (
                        <span className="mt-0.5 block text-[11.5px] text-muted">
                          {group.description}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-[12.5px] text-body">
                      {memberLabel(group)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-[12.5px] text-muted">
                      {group.createdAt ? formatDateTime(group.createdAt) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setOpenId(expanded ? null : group.id)}
                        className="rounded px-2 py-1 text-[11.5px] font-medium text-navy transition-colors hover:bg-[#eef2f8]"
                      >
                        {expanded ? "Hide" : "Members"}
                      </button>
                    </TableCell>
                  </TableRow>,

                  expanded && open ? (
                    <TableRow key={`${group.id}-members`} className="bg-[#fafbfd] hover:bg-[#fafbfd]">
                      <TableCell colSpan={4} className="px-4 py-4">
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-2">
                            {open.members.length === 0 && (
                              <p className="text-[12px] text-muted">No members yet.</p>
                            )}
                            {open.members.map((member) => (
                              <form
                                key={member.id}
                                action={removeGroupMemberAction}
                                className="inline-flex"
                              >
                                <input type="hidden" name="groupId" value={open.id} />
                                <input type="hidden" name="userId" value={member.id} />
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface py-1 pl-2.5 pr-1 text-[11.5px] text-navy">
                                  {member.name}
                                  {canManage && (
                                    <button
                                      type="submit"
                                      title={`Remove ${member.name}`}
                                      aria-label={`Remove ${member.name}`}
                                      className="rounded-full p-0.5 text-muted transition-colors hover:bg-[#eef2f8] hover:text-danger"
                                    >
                                      <X className="h-3 w-3" aria-hidden />
                                    </button>
                                  )}
                                </span>
                              </form>
                            ))}
                          </div>

                          {canManage && candidates.length > 0 && (
                            <form
                              action={addGroupMemberAction}
                              className="flex flex-wrap items-center gap-2"
                            >
                              <input type="hidden" name="groupId" value={open.id} />
                              <select
                                name="userId"
                                required
                                defaultValue=""
                                aria-label={`Add a person to ${open.name}`}
                                className="h-8 min-w-[240px] rounded-md border border-line-strong bg-surface px-2 text-[12px] text-navy outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                              >
                                <option value="" disabled>
                                  Add a person…
                                </option>
                                {candidates.map((person) => (
                                  <option key={person.id} value={person.id}>
                                    {person.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="submit"
                                className={buttonClass({ variant: "secondary", size: "sm" })}
                              >
                                Add
                              </button>
                            </form>
                          )}

                          {canManage && (
                            <form
                              action={deleteGroupAction}
                              onSubmit={(event) => {
                                if (!window.confirm(`Delete ${open.name}? The group is removed; accounts stay.`)) {
                                  event.preventDefault();
                                }
                              }}
                            >
                              <input type="hidden" name="id" value={open.id} />
                              <button
                                type="submit"
                                className="text-[12px] font-medium text-danger hover:underline"
                              >
                                Delete group
                              </button>
                            </form>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null,
                ];
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
