import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "group/btn relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out active:scale-[0.98] focus-visible:outline-offset-4 disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-[#070907] hover:bg-accent-hover shadow-[0_0_0_1px_rgba(184,255,59,0.4),0_8px_28px_-8px_rgba(184,255,59,0.45)] hover:shadow-[0_0_0_1px_rgba(184,255,59,0.6),0_10px_36px_-8px_rgba(184,255,59,0.6)]",
  secondary: "bg-tint/[0.04] text-fg border border-line-strong hover:bg-tint/[0.08] hover:border-tint/25",
  ghost: "text-fg-2 hover:text-fg hover:bg-tint/[0.05]",
  danger: "bg-danger text-white hover:brightness-110 shadow-[0_0_0_1px_rgba(0,0,0,0.1)]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-[13.5px]",
  md: "h-11 px-5 text-[14.5px]",
  lg: "h-12 px-6 text-[15px]",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonLinkProps = Omit<ComponentProps<typeof Link>, "className"> & {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

export function ButtonLink({ variant, size, className, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, className })} {...props}>
      {children}
    </Link>
  );
}

type ButtonProps = Omit<ComponentProps<"button">, "className"> & {
  variant?: Variant;
  size?: Size;
  className?: string;
  loading?: boolean;
};

export function Button({ variant, size, className, loading, disabled, children, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
      ) : null}
      {children}
    </button>
  );
}
