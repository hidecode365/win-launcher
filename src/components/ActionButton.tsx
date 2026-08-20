import type { ButtonHTMLAttributes, ReactNode } from "react";

type ActionButtonVariant = "primary" | "secondary";
type ActionButtonSize = "compact" | "standard";

const BASE_CLASS =
  "inline-flex items-center justify-center rounded outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ui-focus focus-visible:ring-offset-1";

const VARIANT_CLASS: Record<ActionButtonVariant, string> = {
  primary:
    "bg-ui-action text-white hover:bg-ui-action-hover disabled:cursor-not-allowed disabled:bg-ui-disabled disabled:text-ui-disabled-text",
  secondary:
    "bg-ui-surface text-ui-text ring-1 ring-inset ring-ui-muted/50 hover:bg-ui-hover hover:ring-ui-muted disabled:cursor-not-allowed disabled:bg-ui-hover-subtle disabled:text-ui-disabled-text disabled:ring-ui-border",
};

const SIZE_CLASS: Record<ActionButtonSize, string> = {
  compact: "h-6 px-ui-control-x text-ui-meta",
  standard: "h-8 px-ui-control-x text-ui-body",
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
