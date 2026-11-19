"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { CalendarClock, Clock, Lock } from "lucide-react";
import type { TaskWindow } from "@/lib/task-window";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${pad(minutes)}m`;
  return `${minutes}m`;
}

export function WorkspaceClock({ initial }: { initial: TaskWindow }) {
  const [now, setNow] = useState<Date | null>(null);
  const [open, setOpen] = useState(initial.canCreate);

  useEffect(() => {
    const tick = () => {
      const current = new Date();
      setNow(current);
      setOpen(
        current.getTime() >= new Date(initial.opensAt).getTime() &&
          current.getTime() < new Date(initial.closesAt).getTime(),
      );
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [initial.opensAt, initial.closesAt]);

  const zoneLabel = initial.timeZone === "Asia/Kolkata" ? "IST" : initial.timeZone;

  const timeLabel = now
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: initial.timeZone,
      }).format(now)
    : "--:--:--";

  const boundary = open ? initial.closesAt : initial.opensAt;
  const remaining = now ? new Date(boundary).getTime() - now.getTime() : 0;

  return (
    <div className="flex items-center gap-2">
      <div
        className="hidden items-center gap-2 rounded-lg border border-line bg-surface/70 px-2.5 py-1.5 text-[11.5px] text-muted sm:flex"
        title={`Current time in ${initial.timeZone}`}
      >
        <Clock className="h-3.5 w-3.5" aria-hidden />
        <span className="font-mono tabular-nums text-ink/90">{timeLabel}</span>
        <span className="text-[10px] uppercase tracking-wide">{zoneLabel}</span>
      </div>

      <div
        className={clsx(
          "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11.5px]",
          open
            ? "border-success/25 bg-success/10 text-success"
            : "border-warning/25 bg-warning/10 text-warning",
        )}
        title={initial.message}
      >
        {open ? (
          <CalendarClock className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Lock className="h-3.5 w-3.5" aria-hidden />
        )}
        <span className="font-medium">
          {initial.restricted ? "Tasks" : "Tasks 24h"} {open ? "open" : "closed"}
        </span>
        <span className="hidden text-[10.5px] opacity-80 md:inline">
          {remaining > 0 ? `${open ? "closes" : "opens"} in ${formatDuration(remaining)}` : ""}
        </span>
      </div>
    </div>
  );
}
