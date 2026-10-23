"use client";

import { Eye, EyeOff, ChevronDown } from "lucide-react";
import { forwardRef, useId, useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { passwordStrength } from "@/lib/validation/auth";

export const inputClasses =
  "w-full rounded-xl border border-line-strong bg-tint/[0.03] px-3.5 text-[14.5px] text-fg placeholder:text-fg-3 transition-[border-color,box-shadow,background-color] duration-150 outline-none hover:border-tint/25 focus-visible:border-accent/70 focus-visible:shadow-[0_0_0_3px_var(--accent-glow)] focus-visible:outline-none aria-[invalid=true]:border-danger/70 disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Every dropdown in Localians is a native <select> (keyboard, screen readers and phone pickers for free) styled the
 * same way: the browser arrow is replaced by a chevron icon 16px from the right edge, with enough right padding that
 * long labels truncate before reaching it. Where the browser supports customizable selects, the open menu is styled
 * too (globals.css, .ui-select). Use <Select>; selectClasses is exported only for tests and rare custom cases.
 */
export const selectClasses = cn(
  inputClasses,
  "ui-select peer min-w-0 cursor-pointer appearance-none truncate pl-3.5 pr-11 leading-tight",
  "disabled:cursor-not-allowed [&>option]:bg-card [&>option]:text-fg",
);

type FieldProps = {
  label: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  className?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
};

/** Label + control + hint/error wiring with correct ARIA relationships. */
export function Field({ label, error, hint, optional, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between text-[13.5px] font-medium text-fg">
        {label}
        {optional ? <span className="text-[12px] font-normal text-fg-3">Optional</span> : null}
      </label>
      {children({ id, "aria-invalid": !!error, "aria-describedby": describedBy })}
      {hint && !error ? (
        <p id={hintId} className="text-[12.5px] text-fg-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-[12.5px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, ComponentProps<"input">>(function TextInput({ className, ...props }, ref) {
  return <input ref={ref} className={cn(inputClasses, "h-11", className)} {...props} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea">>(function TextArea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(inputClasses, "min-h-[96px] resize-y py-2.5 leading-relaxed", className)} {...props} />;
});

type SelectProps = ComponentProps<"select"> & {
  /** "md" (h-11, forms) or "sm" (h-10, toolbars and compact rows). */
  density?: "md" | "sm";
  /** Layout classes for the wrapper (width, flex). The select itself always fills it. */
  wrapperClassName?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, wrapperClassName, density = "md", children, ...props }, ref) {
  return (
    <span className={cn("group relative inline-flex w-full min-w-0 align-middle", wrapperClassName)}>
      <select ref={ref} className={cn(selectClasses, "w-full", density === "sm" ? "h-10 text-[13.5px]" : "h-11", className)} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="ui-select-chevron pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-fg-3 transition-[transform,color] duration-200 group-hover:text-fg-2 peer-focus-visible:text-accent-ink peer-disabled:opacity-50"
      />
    </span>
  );
});

export const PasswordInput = forwardRef<HTMLInputElement, Omit<ComponentProps<"input">, "type">>(function PasswordInput(
  { className, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input ref={ref} type={visible ? "text" : "password"} className={cn(inputClasses, "h-11 pr-11", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-fg-3 transition-colors hover:bg-tint/[0.06] hover:text-fg"
      >
        {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
      </button>
    </div>
  );
});

export function PasswordStrength({ value }: { value: string }) {
  const { score, label } = passwordStrength(value);
  if (!value) return null;
  const tone = score <= 1 ? "bg-danger" : score === 2 ? "bg-warn" : "bg-accent";
  return (
    <div className="mt-1 flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= score ? tone : "bg-tint/10")} />
        ))}
      </div>
      <span className="w-[68px] text-right text-[12px] text-fg-2">
        <span className="sr-only">Password strength: </span>
        {label}
      </span>
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-xl border border-danger/30 bg-danger/[0.08] px-3.5 py-2.5 text-[13.5px] text-fg">
      {message}
    </div>
  );
}

export function FormNotice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "success" }) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-xl border px-3.5 py-2.5 text-[13.5px] text-fg",
        tone === "success" ? "border-accent/30 bg-accent/[0.08]" : "border-line-strong bg-tint/[0.03]",
      )}
    >
      {children}
    </div>
  );
}
