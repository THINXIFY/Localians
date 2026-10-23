/**
 * Custom preview names (`agentaxio.preview.localians.com`). Client-safe rules shared by the dashboard (instant
 * feedback) and the server (the authority, which also checks ownership and availability).
 */
export const NAME_MIN = 3;
export const NAME_MAX = 32;

/** The format the database also enforces (CHECK constraint). */
export const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
/** Random preview labels (12 chars of a–z, 2–7): custom names may never look like one. */
const RANDOM_LABEL = /^[a-z2-7]{12}$/;

/** Infrastructure, product and generic words that must never be someone's preview. */
const RESERVED = new Set(
  `www api app apps admin administrator dashboard console portal mail email smtp imap pop ns ns1 ns2 ns3 mx dns
  tunnel tunnels gateway gw preview previews localians localian status health docs doc help support billing pay
  payment payments checkout invoice invoices login logon signin sign-in signup sign-up register auth oauth sso
  account accounts security secure root system sys test tests demo dev staging stage prod production cdn static
  assets media img images blog news about legal terms privacy abuse report phishing contact team official
  verify verification update updates download downloads wallet wallets internal intranet vpn ftp ssh git
  webmail autodiscover autoconfig cpanel whm webdisk localhost local example invalid null undefined`.split(
    /\s+/,
  ),
);

/**
 * Brands and phishing terms, so a preview link can't impersonate a well-known service or Localians itself. Matched
 * after collapsing look-alike characters ("paypa1", "l0calians"):
 * - distinctive brands anywhere in the name ("my-paypal-demo"),
 * - short or everyday words only as a whole part between hyphens ("meta-login" is refused, "metadata" is fine).
 */
const BRANDS_ANYWHERE = [
  "localians",
  "thinxify",
  "google",
  "microsoft",
  "outlook",
  "office365",
  "icloud",
  "paypal",
  "amazon",
  "facebook",
  "instagram",
  "whatsapp",
  "github",
  "gitlab",
  "bitbucket",
  "binance",
  "coinbase",
  "metamask",
  "trustwallet",
  "tether",
  "stripe",
  "netflix",
  "spotify",
  "twitter",
  "telegram",
  "discord",
  "dropbox",
  "docusign",
  "linkedin",
  "vercel",
  "netlify",
  "cloudflare",
  "heroku",
  "openai",
  "chatgpt",
  "anthropic",
  "signin",
  "password",
  "recovery",
];
const WHOLE_WORDS = new Set([
  "apple",
  "meta",
  "aws",
  "okx",
  "usdt",
  "zoom",
  "bank",
  "banking",
  "ledger",
  "trezor",
  "kraken",
  "bybit",
  "kucoin",
  "slack",
  "yahoo",
  "claude",
  "gmail",
  "secure",
  "account",
  "accounts",
  "support",
  "wallet",
  "login",
  "verify",
  "official",
]);

/** Collapses common look-alike characters so "g00gle" and "paypa1" are caught too. */
function skeleton(name: string) {
  return name
    .replace(/-/g, "")
    .replace(/0/g, "o")
    .replace(/[1!|]/g, "l")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/rn/g, "m")
    .replace(/vv/g, "w");
}

export type NameProblem =
  { ok: false; reason: string } | { ok: true; name: string };

/** Normalises and checks a requested name. Never says anything about who owns a name. */
export function checkNameFormat(input: string): NameProblem {
  const name = input.trim().toLowerCase();
  if (name.length < NAME_MIN)
    return { ok: false, reason: `Use at least ${NAME_MIN} characters.` };
  if (name.length > NAME_MAX)
    return { ok: false, reason: `Use ${NAME_MAX} characters or fewer.` };
  if (!/^[a-z0-9-]+$/.test(name))
    return {
      ok: false,
      reason: "Use lowercase letters, numbers and hyphens only.",
    };
  if (name.startsWith("-") || name.endsWith("-"))
    return { ok: false, reason: "Start and end with a letter or number." };
  if (name.includes("--"))
    return { ok: false, reason: "Don't use two hyphens in a row." };
  if (!NAME_PATTERN.test(name))
    return {
      ok: false,
      reason: "Use lowercase letters, numbers and hyphens only.",
    };
  if (/^\d+$/.test(name))
    return { ok: false, reason: "Include at least one letter." };
  if (RANDOM_LABEL.test(name))
    return {
      ok: false,
      reason:
        "That looks like a random preview link. Choose a more memorable name.",
    };
  if (RESERVED.has(name))
    return { ok: false, reason: "That name is reserved. Try another." };
  const flat = skeleton(name);
  const words = name.split("-").map(skeleton);
  if (
    BRANDS_ANYWHERE.some((term) => flat.includes(term)) ||
    words.some((w) => WHOLE_WORDS.has(w))
  ) {
    return {
      ok: false,
      reason: "That name could be mistaken for another service. Try another.",
    };
  }
  return { ok: true, name };
}

/** Turns a project name into a suggestion ("Agent Axio!" → "agent-axio"); may still need checking. */
export function suggestName(projectName: string) {
  return projectName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, NAME_MAX)
    .replace(/-+$/g, "");
}
