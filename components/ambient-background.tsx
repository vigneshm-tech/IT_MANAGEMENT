import clsx from "clsx";

/**
 * Static, GPU-cheap ambient backdrop: grid, colour bloom and vignette.
 * Uses CSS only so it is safe in server components.
 */
export function AmbientBackground({ variant = "app" }: { variant?: "app" | "login" }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-[0.55]" />
      <div
        className={clsx(
          "absolute -left-32 -top-40 h-[520px] w-[520px] rounded-full blur-[120px]",
          variant === "login" ? "bg-brand/30" : "bg-brand/20",
        )}
      />
      <div
        className={clsx(
          "absolute -right-40 top-1/3 h-[460px] w-[460px] rounded-full blur-[130px]",
          variant === "login" ? "bg-accent/20" : "bg-accent/10",
        )}
      />
      <div className="absolute bottom-[-220px] left-1/3 h-[520px] w-[520px] rounded-full bg-brand/10 blur-[140px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_25%,var(--color-base)_92%)]" />
    </div>
  );
}
