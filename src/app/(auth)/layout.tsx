import Link from "next/link";
import type { ReactNode } from "react";
import { DevelopedBy } from "@/components/ui/Credit";
import { Logo } from "@/components/ui/Logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="bg-grid mask-fade-y absolute inset-0" />
        <div className="absolute left-1/2 top-[-300px] h-[560px] w-[min(900px,140vw)] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(184,255,59,0.1),transparent)]" />
      </div>
      <header className="container-x flex h-[var(--header-h)] items-center justify-between">
        <Logo priority />
        <Link href="/" className="text-[13.5px] text-fg-2 transition-colors hover:text-fg">
          Back to site
        </Link>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-[420px]">{children}</div>
      </main>
      <footer className="container-x flex h-14 items-center justify-center">
        <DevelopedBy />
      </footer>
    </div>
  );
}
