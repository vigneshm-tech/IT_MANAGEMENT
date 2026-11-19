import clsx from "clsx";

/**
 * TaskTornado letter mark — the initials set as two "T" letterforms,
 * one gold and one navy. Purely typographic: no pictorial icon.
 */
export function LetterMark({
  className,
  tone = "navy",
  decorative = false,
}: {
  className?: string;
  tone?: "navy" | "light";
  /** Hide from assistive tech when the wordmark sits next to it. */
  decorative?: boolean;
}) {
  const second = tone === "light" ? "#ffffff" : "#172c52";
  return (
    <svg
      viewBox="0 0 64 64"
      {...(decorative
        ? { "aria-hidden": true as const }
        : { role: "img", "aria-label": "TaskTornado" })}
      className={clsx("h-8 w-8", className)}
      fill="none"
    >
      {/* Leading T */}
      <rect x="4" y="14" width="26" height="9" rx="1.5" fill="#c6a96c" />
      <rect x="12.75" y="23" width="8.5" height="27" rx="1.5" fill="#c6a96c" />
      {/* Trailing T */}
      <rect x="34" y="14" width="26" height="9" rx="1.5" fill={second} />
      <rect x="42.75" y="23" width="8.5" height="27" rx="1.5" fill={second} />
    </svg>
  );
}

export function Logo({
  className,
  compact = false,
  tone = "navy",
  markClassName,
  nameClassName,
  withLabel = false,
}: {
  className?: string;
  compact?: boolean;
  tone?: "navy" | "light";
  markClassName?: string;
  nameClassName?: string;
  withLabel?: boolean;
}) {
  return (
    <span className={clsx("flex items-center gap-2.5", className)}>
      <LetterMark
        tone={tone}
        decorative
        className={clsx(compact ? "h-8 w-8" : "h-9 w-9", markClassName)}
      />
      <span className="flex flex-col leading-none">
        <span
          className={clsx(
            "font-semibold tracking-[-0.02em]",
            tone === "light" ? "text-white" : "text-navy",
            compact ? "text-[15px]" : "text-[16.5px]",
            nameClassName,
          )}
        >
          TaskTornado
        </span>
        {withLabel && (
          <span
            className={clsx(
              "mt-1 text-[9.5px] font-medium uppercase tracking-[0.18em]",
              tone === "light" ? "text-white/55" : "text-muted",
            )}
          >
            IT Management
          </span>
        )}
      </span>
    </span>
  );
}
