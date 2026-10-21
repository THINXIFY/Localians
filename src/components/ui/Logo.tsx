import Link from "next/link";
import { cn } from "@/lib/cn";

/** Geometric mark: a local frame handing a signal out to a remote node. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cn("size-6", className)}>
      <rect x="2.75" y="8.75" width="12.5" height="12.5" rx="3.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 15 L17.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="15" y="2" width="7" height="7" rx="2" fill="var(--accent)" />
    </svg>
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      aria-label="Localians home"
      className={cn("group inline-flex items-center gap-2.5 text-fg", className)}
    >
      <LogoMark className="transition-transform duration-300 group-hover:-rotate-6" />
      <span className="text-[15px] font-semibold tracking-[0.18em]">LOCALIANS</span>
    </Link>
  );
}
