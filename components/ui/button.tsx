import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-gold text-navy font-semibold hover:bg-[#bb9c5e] active:bg-[#b09255] shadow-[0_1px_1px_rgba(23,44,82,0.08)]",
  secondary:
    "bg-surface text-navy font-medium border border-line-strong hover:bg-[#f2f5fa] active:bg-[#eaeef6]",
  ghost:
    "text-body font-medium hover:bg-[#edf1f8] hover:text-navy active:bg-[#e4e9f3]",
  danger:
    "text-danger font-medium border border-[#eccfcd] bg-surface hover:bg-danger-soft",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[12px] gap-1.5 rounded-md",
  md: "h-9 px-4 text-[13px] gap-2 rounded-md",
};

export function buttonClass({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return clsx(
    "inline-flex items-center justify-center whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return <button className={buttonClass({ variant, size, className })} {...props} />;
}
