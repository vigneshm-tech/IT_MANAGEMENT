import clsx from "clsx";

export function TornadoMark({
  className,
  tone = "navy",
}: {
  className?: string;
  tone?: "navy" | "gold" | "white";
}) {
  const stroke =
    tone === "gold" ? "#c6a96c" : tone === "white" ? "#ffffff" : "currentColor";
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="TaskTornado"
      className={clsx("h-8 w-8", className)}
    >
      <g stroke={stroke} strokeLinecap="round" fill="none">
        <path d="M11 14h42" strokeWidth="6" />
        <path d="M17 25h30" strokeWidth="6" opacity="0.92" />
        <path d="M23 36h18" strokeWidth="6" opacity="0.82" />
        <path d="M28 47h8" strokeWidth="6" opacity="0.72" />
        <path d="M31.5 56h1" strokeWidth="5" opacity="0.6" />
      </g>
    </svg>
  );
}

export function Wordmark({
  className,
  compact = false,
  tone = "navy",
}: {
  className?: string;
  compact?: boolean;
  tone?: "navy" | "white";
}) {
  return (
    <span className={clsx("flex items-center gap-2.5", className)}>
      <span
        className={clsx(
          "flex items-center justify-center rounded-md",
          tone === "white" ? "bg-white/10" : "bg-navy",
          compact ? "h-8 w-8" : "h-9 w-9",
        )}
      >
        <TornadoMark className={compact ? "h-5 w-5" : "h-[22px] w-[22px]"} tone="gold" />
      </span>
      <span className="flex flex-col leading-none">
        <span
          className={clsx(
            "font-semibold tracking-[-0.01em]",
            tone === "white" ? "text-white" : "text-navy",
            compact ? "text-[14.5px]" : "text-[16px]",
          )}
        >
          TaskTornado
        </span>
        {!compact && (
          <span
            className={clsx(
              "mt-1 text-[10px] font-medium uppercase tracking-[0.16em]",
              tone === "white" ? "text-white/55" : "text-muted",
            )}
          >
            IT Management
          </span>
        )}
      </span>
    </span>
  );
}
