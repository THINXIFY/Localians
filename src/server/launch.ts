import "server-only";
import { customNamesRouting } from "./cli/config";
import { paymentsEnabled } from "./upgrades";

/**
 * What the marketing site may advertise as available today. Anything off is labelled "Coming soon" (never linked to a
 * live checkout). The homepage is statically rendered, so it reflects the environment it was built with — deploy.sh
 * builds with the production web.env, so flipping a flag takes effect at the next deploy.
 */
export function launchFlags() {
  return {
    /** 7-Day Pass purchases (PAYMENTS_ENABLED=on). */
    payments: paymentsEnabled(),
    /** Custom preview URLs routed by the gateways (PREVIEW_CUSTOM_NAMES=on). */
    customUrls: customNamesRouting(),
    /** The VS Code extension isn't on the Marketplace yet. */
    vscode: false,
  };
}

export type LaunchFlags = ReturnType<typeof launchFlags>;
