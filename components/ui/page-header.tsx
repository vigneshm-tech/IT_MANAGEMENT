import type { ReactNode } from "react";

export function PageHeader({
  title,
  meta,
  description,
  actions,
  children,
}: {
  title: string;
  meta?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-line pb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-navy">
              {title}
            </h1>
            {meta}
          </div>
          {description && (
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-body">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
