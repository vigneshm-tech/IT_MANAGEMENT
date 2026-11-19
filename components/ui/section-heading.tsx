import Link from "next/link";
import type { ReactNode } from "react";

export function SectionHeading({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  hint?: ReactNode;
  action?: { href: string; label: string } | ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-end justify-between gap-4 ${className ?? ""}`}>
      <div>
        <h2 className="text-[14px] font-semibold text-navy">{title}</h2>
        {hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
      </div>
      {action &&
        (typeof action === "object" && action !== null && "href" in action ? (
          <Link
            href={(action as { href: string }).href}
            className="text-[12.5px] font-medium text-navy transition hover:text-gold"
          >
            {(action as { label: string }).label} →
          </Link>
        ) : (
          (action as ReactNode)
        ))}
    </div>
  );
}
