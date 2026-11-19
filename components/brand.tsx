import clsx from "clsx";

export function TornadoMark({
  className,
  animated = false,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="TaskTornado"
      className={clsx("h-10 w-10", className)}
    >
      <defs>
        <linearGradient id="tt-funnel" x1="6" y1="8" x2="58" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#c4b5fd" />
          <stop offset="0.45" stopColor="#7c5cff" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <g
        stroke="url(#tt-funnel)"
        strokeLinecap="round"
        fill="none"
        className={animated ? "origin-center [animation:spin_18s_linear_infinite]" : undefined}
      >
        <path d="M9 11h46" strokeWidth="7" />
        <path d="M15 23h34" strokeWidth="7" opacity="0.92" />
        <path d="M21 35h22" strokeWidth="7" opacity="0.82" />
        <path d="M27 47h10" strokeWidth="7" opacity="0.72" />
        <path d="M31.5 57h1" strokeWidth="6" opacity="0.62" />
      </g>
    </svg>
  );
}

export function Wordmark({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={clsx("flex items-center gap-2.5", className)}>
      <TornadoMark className={compact ? "h-8 w-8" : "h-10 w-10"} animated={false} />
      <span className="flex flex-col leading-none">
        <span
          className={clsx(
            "font-semibold tracking-tight text-ink",
            compact ? "text-[15px]" : "text-lg",
          )}
        >
          Task<span className="text-brand-soft">Tornado</span>
        </span>
        {!compact && (
          <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-muted">
            IT Management
          </span>
        )}
      </span>
    </span>
  );
}
