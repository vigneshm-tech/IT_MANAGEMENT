import clsx from "clsx";
import { ROLE_BY_ID, type RoleId } from "@/lib/roles";

export function RoleBadge({
  role,
  size = "md",
  className,
}: {
  role: RoleId;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = ROLE_BY_ID[role];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-[10.5px]" : "px-2.5 py-1 text-[11.5px]",
        className,
      )}
      style={{
        borderColor: `${meta.accent}44`,
        backgroundColor: `${meta.accent}14`,
        color: meta.accent,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: meta.accent }}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}
