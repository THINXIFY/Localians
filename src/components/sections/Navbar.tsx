"use client";

import { AnimatePresence, m } from "motion/react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";
import { authClient } from "@/lib/auth-client";
import { navLinks, routes } from "@/lib/site";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // Checked client-side so the marketing pages stay static; visitors see the default CTAs.
  const { data: session } = authClient.useSession();
  const signedIn = Boolean(session?.user);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth >= 1024) setOpen(false);
    };
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 h-[var(--header-h)] border-b transition-[background-color,border-color,backdrop-filter] duration-300",
          scrolled || open
            ? "border-line bg-[#070907]/75 backdrop-blur-xl backdrop-saturate-150"
            : "border-transparent bg-transparent",
        )}
      >
        <nav aria-label="Primary" className="container-x flex h-full items-center justify-between gap-6">
          <Logo />

          <ul className="hidden items-center gap-1 lg:flex">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-full px-3.5 py-2 text-[14px] text-fg-2 transition-colors hover:bg-white/[0.04] hover:text-fg"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden items-center gap-2 lg:flex">
            {signedIn ? (
              <ButtonLink href={routes.dashboard} size="sm">
                Dashboard
              </ButtonLink>
            ) : (
              <>
                <ButtonLink href={routes.signIn} variant="ghost" size="sm">
                  Sign In
                </ButtonLink>
                <ButtonLink href={routes.getStarted} size="sm">
                  Get Started Free
                </ButtonLink>
              </>
            )}
          </div>

          <button
            ref={toggleRef}
            type="button"
            className="-mr-2 inline-flex size-10 items-center justify-center rounded-full text-fg transition-colors hover:bg-white/[0.06] lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </nav>
      </header>

      {/* Sibling of <header>: its backdrop-filter would otherwise become the containing block for this fixed panel. */}
      <AnimatePresence>
        {open ? (
          <m.div
            id="mobile-menu"
            key="mobile-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-0 bottom-0 top-[var(--header-h)] z-50 overflow-y-auto border-t border-line bg-[#070907] lg:hidden"
          >
            <div className="container-x flex min-h-full flex-col pb-8 pt-4">
              <ul className="flex flex-col">
                {navLinks.map((link, i) => (
                  <m.li
                    key={link.href}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.03 * i + 0.05, duration: 0.25 }}
                  >
                    <Link
                      href={link.href}
                      onClick={close}
                      className="flex items-center justify-between border-b border-line py-4 text-[20px] font-medium tracking-tight text-fg"
                    >
                      {link.label}
                      <ArrowRight className="size-4 text-fg-3" aria-hidden="true" />
                    </Link>
                  </m.li>
                ))}
              </ul>
              <div className="mt-auto flex flex-col gap-3 pt-10">
                {signedIn ? (
                  <ButtonLink href={routes.dashboard} size="lg" onClick={close}>
                    Dashboard
                  </ButtonLink>
                ) : (
                  <>
                    <ButtonLink href={routes.getStarted} size="lg" onClick={close}>
                      Get Started Free
                    </ButtonLink>
                    <ButtonLink href={routes.signIn} variant="secondary" size="lg" onClick={close}>
                      Sign In
                    </ButtonLink>
                  </>
                )}
              </div>
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
