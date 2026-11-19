import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "flex flex-col items-center px-6 py-10 text-center"
          : "flex flex-col items-center border border-dashed border-line-strong bg-surface px-6 py-14 text-center"
      }
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eef2f8] text-navy-soft">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden />
      </span>
      <p className="mt-3 text-[14px] font-semibold text-navy">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
