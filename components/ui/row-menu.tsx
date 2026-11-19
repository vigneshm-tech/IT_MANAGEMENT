"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export type RowMenuItem = {
  label: string;
  /** Either navigate (href) or run a client callback (onSelect). */
  href?: string;
  onSelect?: () => void;
  icon?: ReactNode;
  tone?: "default" | "primary";
};

const MENU_WIDTH = 184;

/**
 * Row overflow menu. The panel is portalled to the body and positioned from the
 * trigger rect, so it never gets clipped by the table's horizontal scroller.
 */
export function RowMenu({
  label,
  items,
  trigger,
}: {
  label: string;
  items: RowMenuItem[];
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const close = () => setOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const estimated = 12 + items.length * 34;
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    const top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - estimated - 12));
    setPosition({ top, left });
    setOpen(true);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-7 w-7 items-center justify-center rounded text-muted transition-colors hover:bg-[#eef2f8] hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
      >
        {trigger ?? <MoreHorizontal className="h-4 w-4" aria-hidden />}
        <span className="sr-only">{label}</span>
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label={label}
            style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
            className="fixed z-[90] overflow-hidden rounded-md border border-line bg-surface py-1 shadow-[0_18px_40px_-22px_rgba(23,44,82,0.45)]"
          >
            {items.map((item) => {
              const className = cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-[#f4f7fc]",
                item.tone === "primary" ? "font-medium text-navy" : "text-body hover:text-navy",
              );

              if (item.href) {
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className={className}
                  >
                    <span className="text-muted">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              }

              return (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    item.onSelect?.();
                  }}
                  className={className}
                >
                  <span className="text-muted">{item.icon}</span>
                  {item.label}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
