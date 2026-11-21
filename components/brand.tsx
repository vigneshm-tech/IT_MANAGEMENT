import Image from "next/image";

const RATIO = 14965.96 / 1619.92;

/**
 * TaskTornado wordmark — Audiowide lettering, outlined and shipped as a vector logo.
 * Two locked variants: navy for light surfaces, white for the navy panel.
 */
export function Wordmark({
  tone = "navy",
  height = 24,
  className,
  priority = false,
  alt = "TaskTornado",
}: {
  tone?: "navy" | "light";
  height?: number;
  className?: string;
  priority?: boolean;
  alt?: string;
}) {
  return (
    <Image
      src={tone === "light" ? "/brand/wordmark-inverse.svg" : "/brand/wordmark.svg"}
      alt={alt}
      width={Math.round(height * RATIO)}
      height={height}
      unoptimized
      priority={priority}
      className={className}
    />
  );
}
