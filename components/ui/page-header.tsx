import type { ReactNode } from "react";

/**
 * Module heading. Deliberately renders the module name only — no counts,
 * descriptions, instructions or statistics. `children` sits flush against the
 * bottom rule, which is where sub-module tabs hang their active underline.
 */
export function PageHeader({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-line">
      <div className="flex flex-col gap-4 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-logo text-[21px] font-normal leading-tight tracking-[0.005em] text-navy sm:text-[24px]">
            {title}
          </h1>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
