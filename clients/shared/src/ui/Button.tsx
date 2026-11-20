import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "default" | "primary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
};

function classes(variant: Variant, size: Size, iconOnly: boolean, extra?: string) {
  return [
    "ab-btn",
    variant !== "default" && `ab-btn--${variant}`,
    size !== "md" && `ab-btn--${size}`,
    iconOnly && "ab-btn--icon",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button({ variant = "default", size = "md", icon, loading, children, className, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={classes(variant, size, false, className)} disabled={disabled || loading} {...rest}>
      {loading ? <span className="ab-spinner" style={{ width: 12, height: 12 }} /> : icon}
      {children}
    </button>
  );
}

/** Square icon button. `label` is required: it becomes the tooltip and the accessible name. */
export function IconButton({
  variant = "ghost",
  size = "md",
  label,
  children,
  className,
  type = "button",
  ...rest
}: Omit<ButtonProps, "icon" | "aria-label"> & { label: string }) {
  return (
    <button type={type} className={classes(variant, size, true, className)} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}
