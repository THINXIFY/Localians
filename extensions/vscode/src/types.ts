import type { AppSuggestion } from "./core/detect";

/** A preview shared from a terminal or another computer (listed by the server, not run by this window). */
export type RemotePreview = { id: string; publicUrl: string | null; localPort: number; status: string; expiresAt?: string; project: { name: string } };

/** What a command applies to; passed by the panel and the status menu (palette commands get nothing). */
export type Ref =
  | { kind: "share"; sessionId: string }
  | { kind: "remote"; id: string; publicUrl: string | null }
  | { kind: "app"; app: AppSuggestion }
  | { kind: "manual" }
  | { kind: "link"; url: string };
