import type { ButtonHTMLAttributes, ReactNode } from "react";

type ActionButtonVariant = "primary" | "secondary";
type ActionButtonSize = "compact" | "standard";

const BASE_CLASS =
  "inline-flex items-center justify-center gap-1.5 rounded outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ui-focus focus-visible:ring-offset-1";

const VARIANT_CLASS: Record<ActionButtonVariant, string> = {
  primary:
    "bg-ui-action text-white hover:bg-ui-action-hover disabled:cursor-not-allowed disabled:bg-ui-disabled disabled:text-ui-disabled-text",
  secondary:
    "bg-ui-surface/70 text-ui-muted shadow-sm ring-1 ring-inset ring-ui-border hover:bg-ui-hover hover:text-ui-text hover:shadow active:shadow-none disabled:cursor-not-allowed disabled:bg-ui-hover-subtle disabled:text-ui-disabled-text disabled:shadow-none",
};

const SIZE_CLASS: Record<ActionButtonSize, string> = {
  compact: "px-ui-control-x py-ui-control-y text-ui-meta",
  standard: "px-ui-control-x py-ui-control-y-standard text-ui-body",
};

export function ActionButton({
  variant = "primary",
  size = "compact",
  className = "",
  children,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ActionButtonVariant;
  size?: ActionButtonSize;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      className={`${BASE_CLASS} ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
