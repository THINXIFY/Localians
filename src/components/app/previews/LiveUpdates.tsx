"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { type PreviewStatusValue, STATUS_LABEL } from "@/lib/previews";

type Change = { id: string; projectName: string; status: PreviewStatusValue; previousStatus: PreviewStatusValue | null };
type Mode = "connecting" | "live" | "polling" | "paused" | "offline" | "signed-out";

const MODE_TEXT: Record<Mode, string> = {
  connecting: "Connecting…",
  live: "Live",
  polling: "Auto-refreshing",
  paused: "Paused",
  offline: "Updates paused — retrying",
  "signed-out": "Signed out",
};

const MODE_HELP: Record<Mode, string> = {
  connecting: "Opening the live update stream.",
  live: "Statuses and traffic update automatically.",
  polling: "Live streaming isn't available, so this page checks for changes every few seconds.",
  paused: "Updates pause while this tab is hidden and resume when you come back.",
  offline: "Couldn't reach Localians. Retrying with increasing delays.",
  "signed-out": "Your session ended. Sign in again to see live updates.",
};

/**
 * Subscribes the page to preview changes (SSE, falling back to polling) and refreshes the
 * server-rendered data when something changes. Status transitions are announced politely
 * to screen readers. The stream closes when the tab is hidden and on navigation.
 */
export function LiveUpdates({
  since,
  projectId,
  sessionId,
  minRefreshMs = 0,
  className,
}: {
  /** Server render time (ms): changes after it are fetched on connect. */
  since: number;
  projectId?: string;
  sessionId?: string;
  /** Throttle for heavy pages (e.g. analytics). */
  minRefreshMs?: number;
  className?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("connecting");
  const [announcement, setAnnouncement] = useState("");
  const cursor = useRef(since);

  useEffect(() => {
    let source: EventSource | null = null;
    let pollTimer: number | undefined;
    let refreshTimer: number | undefined;
    let lastRefresh = 0;
    let streamErrors = 0;
    let pollDelay = 5000;
    let disposed = false;

    const query = (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams({ since: String(cursor.current), ...extra });
      if (projectId) params.set("project", projectId);
      if (sessionId) params.set("session", sessionId);
      return params.toString();
    };

    const refresh = () => {
      window.clearTimeout(refreshTimer);
      const wait = Math.max(300, lastRefresh + minRefreshMs - Date.now());
      refreshTimer = window.setTimeout(() => {
        lastRefresh = Date.now();
        router.refresh();
      }, wait);
    };

    const handle = (changes: Change[]) => {
      if (!changes.length) return;
      const transitions = changes.filter((c) => c.previousStatus !== c.status && (c.previousStatus !== null || c.status !== "CONNECTING"));
      if (transitions.length) {
        setAnnouncement(transitions.map((c) => `${c.projectName} preview: ${STATUS_LABEL[c.status]}.`).join(" "));
      }
      refresh();
    };

    const stopAll = () => {
      source?.close();
      source = null;
      window.clearTimeout(pollTimer);
    };

    const poll = async () => {
      if (disposed) return;
      try {
        const response = await fetch(`/api/dashboard/events?${query({ mode: "poll" })}`, { cache: "no-store" });
        if (response.status === 401) return setMode("signed-out");
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { cursor: number; changes: Change[] };
        cursor.current = body.cursor;
        handle(body.changes);
        pollDelay = 5000;
        setMode("polling");
      } catch {
        // Controlled backoff: 5 s → 10 s → … → 60 s.
        pollDelay = Math.min(pollDelay * 2, 60_000);
        setMode("offline");
      }
      if (!disposed) pollTimer = window.setTimeout(poll, pollDelay);
    };

    const openStream = (initial = false) => {
      if (typeof EventSource === "undefined") return void poll();
      if (!initial) setMode("connecting");
      const es = new EventSource(`/api/dashboard/events?${query()}`);
      source = es;
      es.onopen = () => {
        streamErrors = 0;
        setMode("live");
      };
      es.addEventListener("previews", (event) => {
        const e = event as MessageEvent<string>;
        if (e.lastEventId) cursor.current = Number(e.lastEventId) || cursor.current;
        try {
          handle((JSON.parse(e.data) as { changes: Change[] }).changes);
        } catch {
          // ignore malformed frames
        }
      });
      es.addEventListener("unauthorized", () => {
        stopAll();
        setMode("signed-out");
      });
      es.onerror = () => {
        // Streams end every ~50 s by design and EventSource reconnects on its own (resuming from
        // Last-Event-ID). Repeated failures, or a non-stream response, switch to polling.
        streamErrors++;
        if (es.readyState === EventSource.CLOSED || streamErrors >= 4) {
          es.close();
          if (source === es) source = null;
          void poll();
        } else {
          setMode("connecting");
        }
      };
    };

    const onVisibility = () => {
      if (document.hidden) {
        stopAll();
        setMode("paused");
      } else {
        streamErrors = 0;
        pollDelay = 5000;
        openStream();
        // Catch up on anything that changed while hidden.
        refresh();
      }
    };

    if (!document.hidden) openStream(true);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      stopAll();
      window.clearTimeout(refreshTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, projectId, sessionId, minRefreshMs]);

  return (
    <>
      <span
        className={cn("inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-[11px] text-fg-3", className)}
        title={MODE_HELP[mode]}
        data-live-mode={mode}
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            mode === "live" ? "bg-accent" : mode === "polling" ? "bg-accent/60" : mode === "offline" || mode === "signed-out" ? "bg-danger" : "bg-fg-3/60",
          )}
        />
        {MODE_TEXT[mode]}
      </span>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </>
  );
}
