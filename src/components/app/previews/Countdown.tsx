"use client";

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { formatRemaining } from "@tunnel/shared/durations";

/**
 * Live "Expires in 42m 10s" for an active preview, with the exact time on hover and for screen readers. The server
 * and the gateway enforce the deadline; this only shows it. Not announced every second (aria-live off).
 */
export function Countdown({ expiresAt, className, onExpired }: { expiresAt: Date | string; className?: string; onExpired?: () => void }) {
  const at = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  const [now, setNow] = useState<number | null>(null); // null on the server and the first client render (no mismatch)
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const left = now === null ? null : at.getTime() - now;
  const over = left !== null && left <= 0;
  useEffect(() => {
    if (over) onExpired?.();
  }, [over, onExpired]);
  const soon = left !== null && left > 0 && left < 5 * 60_000;
  return (
    <span className={cn("inline-flex items-center gap-1 tabular-nums", soon ? "text-warn" : over ? "text-fg-3" : undefined, className)} data-testid="countdown">
      <Clock className="size-3.5 shrink-0" aria-hidden="true" />
      <span role="timer" aria-live="off">
        {over ? "Time's up" : left === null ? "Expires" : <>Expires in {formatRemaining(left)}</>}
      </span>
      <time dateTime={at.toISOString()} className="text-fg-3">
        {" "}
        · {formatDateTime(at)}
      </time>
    </span>
  );
}
