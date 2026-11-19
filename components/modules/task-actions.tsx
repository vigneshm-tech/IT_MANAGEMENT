"use client";

import { Eye, GitBranch, NotebookPen, PencilLine } from "lucide-react";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";

/**
 * Row options navigate to the task page — the app deliberately has no form
 * popups. The menu only offers what the role may actually do.
 */
export function TaskActions({
  taskId,
  canEdit,
  canContribute,
}: {
  taskId: string;
  canEdit: boolean;
  canContribute: boolean;
}) {
  const items: RowMenuItem[] = [
    {
      label: "View task",
      href: `/modules/tasks/${taskId}`,
      icon: <Eye className="h-3.5 w-3.5" aria-hidden />,
    },
  ];

  if (canContribute) {
    items.push({
      label: "Change status",
      href: `/modules/tasks/${taskId}#status`,
      icon: <GitBranch className="h-3.5 w-3.5" aria-hidden />,
    });
  }
  if (canEdit) {
    items.push({
      label: "Edit task",
      href: `/modules/tasks/${taskId}/edit`,
      icon: <PencilLine className="h-3.5 w-3.5" aria-hidden />,
    });
  }
  if (canContribute) {
    items.push({
      label: "Update notes",
      href: `/modules/tasks/${taskId}#notes`,
      icon: <NotebookPen className="h-3.5 w-3.5" aria-hidden />,
    });
  }

  return <RowMenu label={`Options for ${taskId}`} items={items} />;
}
