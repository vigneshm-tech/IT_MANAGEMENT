import clsx from "clsx";

export type Tone = "positive" | "pending" | "neutral" | "danger" | "navy";

const TONES: Record<Tone, string> = {
  positive: "bg-success-soft text-success",
  pending: "bg-warning-soft text-warning",
  neutral: "bg-[#eef2f8] text-body",
  danger: "bg-danger-soft text-danger",
  navy: "bg-[#eaeef6] text-navy",
};

const STATUS_TONE: Record<string, Tone> = {
  active: "positive",
  approved: "positive",
  completed: "positive",
  done: "positive",
  renewed: "positive",
  connected: "positive",
  disconnected: "danger",
  healthy: "positive",
  in_progress: "navy",
  "in progress": "navy",
  open: "navy",
  todo: "neutral",
  planned: "pending",
  pending: "pending",
  due: "pending",
  scheduled: "pending",
  attention: "pending",
  "pending uninstall": "pending",
  inactive: "neutral",
  suspended: "danger",
  draft: "neutral",
  rejected: "danger",
  expired: "danger",
  overdue: "danger",
  critical: "danger",
  high: "danger",
  medium: "pending",
  low: "neutral",
};

const LABELS: Record<string, string> = {
  in_progress: "In progress",
  todo: "To do",
};

export function humanise(value: string | null | undefined): string {
  if (!value) return "—";
  return LABELS[value] ?? value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function toneFor(status: string | null | undefined): Tone {
  if (!status) return "neutral";
  return STATUS_TONE[status.toLowerCase()] ?? "neutral";
}

export function StatusPill({
  status,
  tone,
  label,
  className,
}: {
  status?: string;
  tone?: Tone;
  label?: string;
  className?: string;
}) {
  const value = status ?? "";
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded px-2 py-[3px] text-[11px] font-medium leading-none",
        TONES[tone ?? toneFor(value)],
        className,
      )}
    >
      {label ?? humanise(value)}
    </span>
  );
}
