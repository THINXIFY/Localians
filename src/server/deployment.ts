/**
 * True on a real production deployment (set `LOCALIANS_DEPLOYMENT=production` in the server's
 * environment file). It switches off every development/test escape hatch, even if one is
 * accidentally configured: console/outbox email, disabled auth rate limits.
 * (`NODE_ENV=production` alone isn't enough: local end-to-end tests also run `next start`.)
 */
export const isDeployedProduction = () => process.env.LOCALIANS_DEPLOYMENT === "production";
