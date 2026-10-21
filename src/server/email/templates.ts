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
