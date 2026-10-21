import fs from "node:fs";
import path from "node:path";
import { OUTBOX_DIR_PATH } from "./paths";

type OutboxEmail = { to: string; subject: string; text: string; html: string; kind: string; sentAt: string };

/** Reads emails written by EMAIL_TRANSPORT=outbox (test-only transport). */
export function readOutbox(to: string, kind?: string): OutboxEmail[] {
  if (!fs.existsSync(OUTBOX_DIR_PATH)) return [];
  return fs
    .readdirSync(OUTBOX_DIR_PATH)
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(OUTBOX_DIR_PATH, f), "utf8")) as OutboxEmail)
    .filter((m) => m.to.toLowerCase() === to.toLowerCase() && (!kind || m.kind === kind));
}

/** Polls the outbox (emails may be sent asynchronously) and returns the first URL in the newest match. */
export async function waitForEmailLink(to: string, kind: string, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const messages = readOutbox(to, kind);
    const latest = messages[messages.length - 1];
    const url = latest?.text.match(/https?:\/\/\S+/)?.[0];
    if (url) return url;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`No "${kind}" email for ${to} within ${timeoutMs}ms`);
}
