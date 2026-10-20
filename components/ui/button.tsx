import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const variants = {
  stamp: "btn-stamp",
  carbon: "btn-carbon",
  ghost: "btn-ghost",
  paper: "btn-paper",
} as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  loading?: boolean;
};

export function Button({
  className,
  variant = "stamp",
  type = "button",
  loading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn("btn", variants[variant], loading && "is-loading", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {children}
    </button>
  );
}
