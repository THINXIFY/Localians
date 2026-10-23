/**
 * The Preview Pass offer: price and length, and every label derived from them, so the homepage, dashboard, checkout
 * and emails can never disagree. The server decides the values (admin setting, snapshotted on each order); this
 * module only formats them and is safe to use in the browser.
 *
 * Pricing policy: prices are set in US dollars with whole cents and charged 1:1 in USDT (a dollar-pegged
 * stablecoin): a $5.00 pass is paid with exactly 5 USDT. No exchange rate is applied, and the on-chain check
 * requires at least the order's own amount.
 */
export type PassOffer = {
  /** USDT micro-units (6 decimals), as a string so it can be sent to the browser. */
  priceMicros: string;
  days: number;
  /** "$5" or "$4.99" */
  priceLabel: string;
  /** "5 USDT" or "4.99 USDT" */
  usdtLabel: string;
  /** "7-Day Preview Pass" */
  name: string;
  /** "7-Day Pass" */
  shortName: string;
  /** "7 days" / "1 day" */
  daysLabel: string;
  /** "7 more days" / "1 more day" */
  moreLabel: string;
};

export const PRICE_LIMITS = { minUsd: 1, maxUsd: 500 } as const;
export const DAYS_LIMITS = { min: 1, max: 60 } as const;

const amount = (micros: bigint) => {
  const cents = micros / 10_000n;
  const whole = cents / 100n;
  const rest = cents % 100n;
  return rest === 0n ? whole.toString() : `${whole}.${rest.toString().padStart(2, "0")}`;
};

export function makeOffer(priceMicros: bigint | number | string, days: number): PassOffer {
  const micros = BigInt(priceMicros);
  const value = amount(micros);
  return {
    priceMicros: micros.toString(),
    days,
    priceLabel: `$${value}`,
    usdtLabel: `${value} USDT`,
    name: `${days}-Day Preview Pass`,
    shortName: `${days}-Day Pass`,
    daysLabel: `${days} ${days === 1 ? "day" : "days"}`,
    moreLabel: `${days} more ${days === 1 ? "day" : "days"}`,
  };
}

/** The offer before any admin change (and the fallback when the database can't be read during a build). */
export const DEFAULT_OFFER = makeOffer(5_000_000n, 7);

/** Parses an admin-entered USD price ("5", "4.99", "$12.50") into USDT micro-units; whole cents only. */
export function parseUsdPrice(input: string): { ok: true; micros: bigint } | { ok: false; error: string } {
  const text = String(input ?? "").trim().replace(/^\$/, "");
  const match = /^(\d{1,4})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return { ok: false, error: "Enter a price in US dollars, like 5 or 4.99." };
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (cents < BigInt(PRICE_LIMITS.minUsd * 100) || cents > BigInt(PRICE_LIMITS.maxUsd * 100)) {
    return { ok: false, error: `The price must be between $${PRICE_LIMITS.minUsd} and $${PRICE_LIMITS.maxUsd}.` };
  }
  return { ok: true, micros: cents * 10_000n };
}

export function parsePassDays(input: string | number): { ok: true; days: number } | { ok: false; error: string } {
  const text = String(input ?? "").trim();
  if (!/^\d{1,3}$/.test(text)) return { ok: false, error: "Enter the pass length in whole days." };
  const days = Number(text);
  if (days < DAYS_LIMITS.min || days > DAYS_LIMITS.max) return { ok: false, error: `The pass length must be ${DAYS_LIMITS.min} to ${DAYS_LIMITS.max} days.` };
  return { ok: true, days };
}

/** What to do after paying, naming the pass the order is for. */
export const afterPaymentMessage = (passName: string) =>
  `After payment, email your payment screenshot, transaction hash, Localians username and Order ID to hello@thinxify.com. Your ${passName} will activate after successful payment verification.`;
