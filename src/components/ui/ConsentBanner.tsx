"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { applyConsent, CONSENT_REOPEN_EVENT, type ConsentChoice, storedConsent } from "@/lib/analytics";
import { routes } from "@/lib/site";

const CHANGED = "localians:cookie-consent-changed";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange); // another tab decided
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The cookie banner: Accept turns on Google Analytics cookies, Decline keeps them off. Nothing is rendered on the
 * server (the choice lives in the browser), so it appears after load only for visitors who haven't chosen yet, or who
 * opened "Cookie settings".
 */
export function ConsentBanner() {
  const choice = useSyncExternalStore(subscribe, () => storedConsent() ?? "unset", () => "server");
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    const open = () => setReopened(true);
    window.addEventListener(CONSENT_REOPEN_EVENT, open);
    return () => window.removeEventListener(CONSENT_REOPEN_EVENT, open);
  }, []);

  if (choice === "server" || (choice !== "unset" && !reopened)) return null;

  function decide(value: ConsentChoice) {
    applyConsent(value);
    setReopened(false);
    window.dispatchEvent(new Event(CHANGED));
  }

  return (
    <section
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-3 bottom-3 z-[90] mx-auto max-w-[640px] rounded-2xl border border-line-strong bg-card/95 p-4 shadow-[0_18px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur sm:inset-x-6 sm:bottom-6 sm:p-5"
      data-testid="cookie-banner"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-fg-2">
          We&apos;d like to use Google Analytics cookies to understand how the site is used. They&apos;re off unless you accept.{" "}
          <Link href={`${routes.privacy}#cookies`} className="text-fg underline underline-offset-4 hover:text-accent-ink">
            Privacy Policy
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => decide("denied")}
            className="h-10 flex-1 rounded-full border border-line-strong px-4 text-[13.5px] font-medium text-fg transition-colors hover:bg-tint/[0.06] sm:flex-none"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => decide("granted")}
            className="h-10 flex-1 rounded-full bg-accent px-4 text-[13.5px] font-medium text-[#070907] transition-[filter] hover:brightness-110 sm:flex-none"
          >
            Accept
          </button>
        </div>
      </div>
    </section>
  );
}

/** "Cookie settings": reopens the banner so the visitor can change their choice. */
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(CONSENT_REOPEN_EVENT))} className={className}>
      Cookie settings
    </button>
  );
}
