import "server-only";
import { customNamesRouting } from "./cli/config";
import { DEFAULT_OFFER, type PassOffer } from "@/lib/offer";
import { emergencyDisabled, getPassOffer, paymentsEnabled } from "./payment-settings";

/**
 * What the marketing site may advertise as available today. Anything off is labelled "Coming soon" (never linked to a
 * live checkout). Payments come from the admin-managed setting; the pages that use it are revalidated when an admin
 * changes it (and every few minutes), so no redeploy is needed. If the database can't be reached (a build without
 * one), the environment's initial value is used.
 */
export async function launchFlags() {
  let payments: boolean;
  let offer: PassOffer;
  try {
    [payments, offer] = await Promise.all([paymentsEnabled(), getPassOffer()]);
  } catch {
    payments = !emergencyDisabled() && process.env.PAYMENTS_ENABLED === "on";
    offer = DEFAULT_OFFER;
  }
  return {
    /** 7-Day Pass purchases (admin setting in /admin/settings). */
    payments,
    /** The Preview Pass price and length (admin setting in /admin/settings). */
    offer,
    /** Custom preview URLs routed by the gateways (PREVIEW_CUSTOM_NAMES=on). */
    customUrls: customNamesRouting(),
    /** The VS Code extension isn't on the Marketplace yet. */
    vscode: false,
  };
}

export type LaunchFlags = Awaited<ReturnType<typeof launchFlags>>;
