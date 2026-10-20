import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

type FieldTone = "desk" | "paper";

export function Input({
  className,
  tone = "desk",
  type,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { tone?: FieldTone }) {
  const control = (
    <input
      type={type}
      className={cn("field-control", tone === "paper" && "field-on-paper", className)}
      {...props}
    />
  );
  if (type === "date") {
    return (
      <span className="field-date">
        {control}
        <span className="field-date-mark" aria-hidden />
      </span>
    );
  }
  return control;
}

export function Select({
  className,
  tone = "desk",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { tone?: FieldTone }) {
  return (
    <span className="field-select">
      <select className={cn("field-control", tone === "paper" && "field-on-paper", className)} {...props} />
      <span className="field-select-mark" aria-hidden />
    </span>
  );
}

export function Textarea({
  className,
  tone = "desk",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { tone?: FieldTone }) {
  return <textarea className={cn("field-control", tone === "paper" && "field-on-paper", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="ticket-kicker text-[var(--color-muted)]">{label}</span>
      {children}
      {error ? (
        <span className="text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="text-sm text-[var(--color-muted)]">{hint}</span>
      ) : null}
    </label>
  );
}
