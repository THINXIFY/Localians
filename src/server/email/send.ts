import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Machine-readable kind, used by tests to find a message. */
  kind: "verify-email" | "reset-password" | "change-email" | "existing-account";
};

type Transport = "resend" | "console" | "outbox";

function resolveTransport(): Transport {
  const configured = process.env.EMAIL_TRANSPORT?.trim().toLowerCase();
  const transport = (configured || (process.env.RESEND_API_KEY ? "resend" : "")) as Transport | "";

  if (!transport) {
    throw new Error(
      "Email delivery is not configured. Set RESEND_API_KEY (and EMAIL_FROM) for real delivery, " +
        "or EMAIL_TRANSPORT=console for local development.",
    );
  }
  if (!["resend", "console", "outbox"].includes(transport)) {
    throw new Error(`Unknown EMAIL_TRANSPORT "${transport}". Use resend, console or outbox.`);
  }
  if (transport !== "resend" && process.env.NODE_ENV === "production" && process.env.ALLOW_TEST_EMAIL_TRANSPORT !== "1") {
    throw new Error(`EMAIL_TRANSPORT=${transport} is for development and tests only. Configure Resend for production.`);
  }
  return transport;
}

export const OUTBOX_DIR = path.resolve(process.cwd(), ".localians-dev", "outbox");

/** Sends a transactional email. Never logs message bodies in production. */
export async function sendEmail(message: EmailMessage) {
  const transport = resolveTransport();

  if (transport === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) throw new Error("RESEND_API_KEY and EMAIL_FROM must both be set to send email.");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
    });
    if (!response.ok) {
      // Status only — the response body could echo message content.
      throw new Error(`Email provider rejected the message (HTTP ${response.status}).`);
    }
    return;
  }

  if (transport === "outbox") {
    await fs.mkdir(OUTBOX_DIR, { recursive: true });
    const file = path.join(OUTBOX_DIR, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
    await fs.writeFile(file, JSON.stringify({ ...message, sentAt: new Date().toISOString() }, null, 2));
    return;
  }

  // console — explicit, development-only stand-in for a real provider.
  console.info(
    [
      "",
      "┌─ [dev email] EMAIL_TRANSPORT=console — this email was NOT delivered ─────────",
      `│ To:      ${message.to}`,
      `│ Subject: ${message.subject}`,
      "│",
      ...message.text.split("\n").map((line) => `│ ${line}`),
      "└──────────────────────────────────────────────────────────────────────────────",
      "",
    ].join("\n"),
  );
}
