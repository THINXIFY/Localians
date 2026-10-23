import "server-only";
import type { EmailMessage } from "./send";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Public, absolute HTTPS URL of the email logo: email clients fetch images from the internet, so it
 * must never be a localhost or relative URL. Defaults to the production site; EMAIL_ASSET_BASE_URL overrides.
 */
export function emailLogoUrl() {
  const base = (process.env.EMAIL_ASSET_BASE_URL ?? "https://localians.com").replace(/\/+$/, "");
  return `${base}/images/logo/localians-logo-email.png`;
}

function layout({ heading, body, cta, url, footnote }: { heading: string; body: string; cta: string; url: string; footnote: string }) {
  const safeUrl = escapeHtml(url);
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#070907;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#F7F8F5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070907;padding:40px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#111511;border:1px solid rgba(255,255,255,0.08);border-radius:16px;">
          <tr><td style="padding:32px 32px 0;">
            <a href="https://localians.com" style="text-decoration:none;"><img src="${escapeHtml(emailLogoUrl())}" width="180" height="30" alt="Localians" style="display:block;width:180px;height:30px;border:0;outline:none;text-decoration:none;color:#F7F8F5;font-size:16px;font-weight:600;" /></a>
          </td></tr>
          <tr><td style="padding:28px 32px 8px;">
            <h1 style="margin:0;font-size:22px;line-height:1.25;font-weight:600;color:#F7F8F5;">${escapeHtml(heading)}</h1>
            <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#A7B0A4;">${body}</p>
          </td></tr>
          <tr><td style="padding:24px 32px;">
            <a href="${safeUrl}" style="display:inline-block;background:#B8FF3B;color:#070907;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px;">${escapeHtml(cta)}</a>
          </td></tr>
          <tr><td style="padding:0 32px 32px;">
            <p style="margin:0;font-size:12.5px;line-height:1.6;color:#858F84;">${escapeHtml(footnote)}</p>
            <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#858F84;word-break:break-all;">${safeUrl}</p>
          </td></tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
          <tr><td align="center" style="padding:20px 16px 0;font-size:12px;line-height:1.6;color:#858F84;">
            <a href="https://localians.com" style="color:#A7B0A4;text-decoration:none;">Localians</a> · Your localhost. Anywhere.<br />
            Developed by: <a href="https://thinxify.com" style="color:#A7B0A4;text-decoration:underline;">Thinxify Technologies</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function verifyEmailMessage({ to, name, url }: { to: string; name: string; url: string }): EmailMessage {
  return {
    kind: "verify-email",
    to,
    subject: "Verify your email for Localians",
    html: layout({
      heading: "Confirm your email address",
      body: `Hi ${escapeHtml(name)}, confirm this email address to finish setting up your Localians account.`,
      cta: "Verify email",
      url,
      footnote: "This link expires in 1 hour. If you didn't create a Localians account, you can ignore this email.",
    }),
    text: `Hi ${name},\n\nConfirm your email address to finish setting up your Localians account:\n${url}\n\nThis link expires in 1 hour. If you didn't create an account, ignore this email.`,
  };
}

export function resetPasswordMessage({ to, name, url }: { to: string; name: string; url: string }): EmailMessage {
  return {
    kind: "reset-password",
    to,
    subject: "Reset your Localians password",
    html: layout({
      heading: "Reset your password",
      body: `Hi ${escapeHtml(name)}, we received a request to reset the password for your Localians account.`,
      cta: "Choose a new password",
      url,
      footnote: "This link expires in 1 hour and can be used once. If you didn't request a reset, you can ignore this email — your password won't change.",
    }),
    text: `Hi ${name},\n\nReset your Localians password:\n${url}\n\nThis link expires in 1 hour and can be used once. If you didn't request this, ignore this email.`,
  };
}

export function existingAccountMessage({ to, name, url }: { to: string; name: string; url: string }): EmailMessage {
  return {
    kind: "existing-account",
    to,
    subject: "Someone tried to create a Localians account with your email",
    html: layout({
      heading: "You already have an account",
      body: `Hi ${escapeHtml(name)}, someone just tried to sign up for Localians with this email address. If that was you, sign in instead — or reset your password if you've forgotten it.`,
      cta: "Sign in to Localians",
      url,
      footnote: "If this wasn't you, no action is needed. Your account hasn't changed.",
    }),
    text: `Hi ${name},\n\nSomeone tried to sign up for Localians with this email. If that was you, sign in instead (or reset your password):\n${url}\n\nIf this wasn't you, no action is needed.`,
  };
}

export function changeEmailMessage({ to, name, newEmail, url }: { to: string; name: string; newEmail: string; url: string }): EmailMessage {
  return {
    kind: "change-email",
    to,
    subject: "Confirm your new Localians email address",
    html: layout({
      heading: "Confirm your email change",
      body: `Hi ${escapeHtml(name)}, a request was made to change your Localians email to <strong style="color:#F7F8F5;">${escapeHtml(newEmail)}</strong>.`,
      cta: "Approve change",
      url,
      footnote: "If you didn't request this change, ignore this email and consider changing your password.",
    }),
    text: `Hi ${name},\n\nA request was made to change your Localians email to ${newEmail}. Approve it here:\n${url}\n\nIf you didn't request this, ignore this email.`,
  };
}

/** To the administrator: a new upgrade request, or a customer submitted a transaction hash. */
export function upgradeRequestAdminMessage(input: { to: string; orderId: string; username: string; email: string; projectName: string; txHash?: string | null; url: string }): EmailMessage {
  const what = input.txHash ? "submitted a transaction hash" : "requested a Preview Pass";
  return {
    kind: "upgrade-request-admin",
    to: input.to,
    subject: `${input.orderId}: ${input.username} ${what}`,
    html: layout({
      heading: input.txHash ? "Transaction hash submitted" : "New Preview Pass request",
      body: `<strong style="color:#F7F8F5;">${escapeHtml(input.orderId)}</strong> · ${escapeHtml(input.username)} (${escapeHtml(input.email)}) · project ${escapeHtml(input.projectName)}${
        input.txHash ? `<br />Transaction: <span style="font-family:monospace;word-break:break-all;">${escapeHtml(input.txHash)}</span>` : ""
      }<br /><br />Verify the transfer on BNB Smart Chain in the admin panel before approving.`,
      cta: "Review in admin",
      url: input.url,
      footnote: "Approval activates the pass immediately. Never approve on a screenshot or hash alone — run the on-chain check.",
    }),
    text: `${input.orderId}: ${input.username} (${input.email}) ${what} for project ${input.projectName}.${input.txHash ? `\nTransaction: ${input.txHash}` : ""}\n\nReview: ${input.url}`,
  };
}

/** To the customer: their pass is active (named with the order's own length, e.g. "7-Day Preview Pass"). */
export function passActivatedMessage(input: { to: string; name: string; orderId: string; projectName: string; endsAt: Date; customUrl: string | null; url: string; passName?: string }): EmailMessage {
  const passName = input.passName ?? "Preview Pass";
  const until = input.endsAt.toUTCString();
  return {
    kind: "pass-activated",
    to: input.to,
    subject: `Your ${passName} is active (${input.orderId})`,
    html: layout({
      heading: `Your ${passName} is active`,
      body: `Hi ${escapeHtml(input.name)}, payment for <strong style="color:#F7F8F5;">${escapeHtml(input.orderId)}</strong> is verified. You can share <strong style="color:#F7F8F5;">${escapeHtml(input.projectName)}</strong> until ${escapeHtml(until)}${
        input.customUrl ? `, at <span style="font-family:monospace;">${escapeHtml(input.customUrl)}</span>` : ""
      }.<br /><br />Your computer and app must stay running and connected for the preview to work.`,
      cta: "Start sharing",
      url: input.url,
      footnote: "The pass doesn't renew by itself. Renew before it ends to keep sharing and keep your custom URL.",
    }),
    text: `Hi ${input.name},\n\nPayment for ${input.orderId} is verified. You can share ${input.projectName} until ${until}${input.customUrl ? ` at ${input.customUrl}` : ""}.\nYour computer and app must stay running for the preview to work.\n\n${input.url}`,
  };
}

/** To the customer: the request couldn't be approved. */
export function upgradeRejectedMessage(input: { to: string; name: string; orderId: string; reason: string; url: string }): EmailMessage {
  return {
    kind: "upgrade-rejected",
    to: input.to,
    subject: `Update on your Localians order ${input.orderId}`,
    html: layout({
      heading: "We couldn't verify this payment",
      body: `Hi ${escapeHtml(input.name)}, order <strong style="color:#F7F8F5;">${escapeHtml(input.orderId)}</strong> wasn't approved: ${escapeHtml(input.reason)}<br /><br />If you believe this is a mistake, reply to hello@thinxify.com with your transaction hash, username and order ID.`,
      cta: "Open dashboard",
      url: input.url,
      footnote: "No Preview Pass was activated for this order.",
    }),
    text: `Hi ${input.name},\n\nOrder ${input.orderId} wasn't approved: ${input.reason}\nContact hello@thinxify.com with your transaction hash, username and order ID if you believe this is a mistake.\n\n${input.url}`,
  };
}

/** To the customer: an administrator added a pass to one project (complimentary access or a support adjustment). */
export function passGrantedMessage(input: { to: string; name: string; projectName: string; passName: string; startsAt: Date; endsAt: Date; complimentary: boolean; url: string }): EmailMessage {
  const until = input.endsAt.toUTCString();
  const later = input.startsAt.getTime() > Date.now() + 60_000;
  const when = later ? `from ${input.startsAt.toUTCString()} (after your current pass) until ${until}` : `until ${until}`;
  const why = input.complimentary ? "complimentary, no payment needed" : "added by our support team";
  return {
    kind: "pass-granted",
    to: input.to,
    subject: `${input.passName} added to ${input.projectName}`,
    html: layout({
      heading: `Your ${input.passName} is ${later ? "scheduled" : "active"}`,
      body: `Hi ${escapeHtml(input.name)}, we added a ${escapeHtml(input.passName)} to <strong style="color:#F7F8F5;">${escapeHtml(input.projectName)}</strong> (${why}). You can share it ${escapeHtml(when)}.<br /><br />It applies to this project only. Your computer and app must stay running and connected for the preview to work.`,
      cta: "Open dashboard",
      url: input.url,
      footnote: "The pass doesn't renew by itself. Questions? Reply to hello@thinxify.com.",
    }),
    text: `Hi ${input.name},\n\nWe added a ${input.passName} to ${input.projectName} (${why}). You can share it ${when}.\nIt applies to this project only. Your computer and app must stay running for the preview to work.\n\n${input.url}`,
  };
}

/** To the customer: an administrator revoked a pass on one project. */
export function passRevokedMessage(input: { to: string; name: string; projectName: string; reason: string; url: string }): EmailMessage {
  return {
    kind: "pass-revoked",
    to: input.to,
    subject: `Preview Pass removed from ${input.projectName}`,
    html: layout({
      heading: "A Preview Pass was removed",
      body: `Hi ${escapeHtml(input.name)}, a Preview Pass on <strong style="color:#F7F8F5;">${escapeHtml(input.projectName)}</strong> was revoked: ${escapeHtml(input.reason)}<br /><br />If you believe this is a mistake, reply to hello@thinxify.com with your username and project name.`,
      cta: "Open dashboard",
      url: input.url,
      footnote: "Other projects are not affected.",
    }),
    text: `Hi ${input.name},\n\nA Preview Pass on ${input.projectName} was revoked: ${input.reason}\nContact hello@thinxify.com if you believe this is a mistake.\n\n${input.url}`,
  };
}

/** To the operators: the wallet that new orders pay to was changed in /admin/settings. */
export function paymentDestinationChangedMessage(input: { to: string; adminEmail: string; previous: string; next: string; at: Date; url: string }): EmailMessage {
  return {
    kind: "payment-destination-changed",
    to: input.to,
    subject: "Localians payment wallet changed",
    html: layout({
      heading: "Payment wallet changed",
      body: `${escapeHtml(input.adminEmail)} changed the USDT (BNB Smart Chain, BEP20) wallet that new Preview Pass orders pay to, at ${escapeHtml(input.at.toUTCString())}.<br /><br />Previous: <span style="font-family:monospace;word-break:break-all;">${escapeHtml(input.previous)}</span><br />New: <span style="font-family:monospace;word-break:break-all;color:#F7F8F5;">${escapeHtml(input.next)}</span><br /><br />Orders created before the change keep their original wallet and are verified against it.`,
      cta: "Review payment settings",
      url: input.url,
      footnote: "If you didn't expect this change, disable payments in the admin panel and change the admin password now.",
    }),
    text: `${input.adminEmail} changed the payment wallet at ${input.at.toUTCString()}.\nPrevious: ${input.previous}\nNew: ${input.next}\n\nOrders created before the change keep their original wallet.\nReview: ${input.url}\n\nIf you didn't expect this, disable payments and change the admin password now.`,
  };
}
