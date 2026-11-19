import type { ReactNode } from "react";

/**
 * Module heading. Deliberately renders the module name only — no counts,
 * descriptions, instructions or statistics. Actions stay available for the
 * controls the module already offered.
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
    <header className="border-b border-line pb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-navy">
            {title}
          </h1>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
