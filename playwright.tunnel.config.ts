import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";
import { TUNNEL_E2E } from "./tests/tunnel-e2e/env";
import { TEST_ENV } from "./tests/setup/test-env";

/**
 * Real local end-to-end test of the tunnel: production control plane + bundled gateway
 * (HTTPS with a local CA) + bundled CLI + real Next.js and Vite dev servers.
 * Run `npm run build && npm run tunnel:build` first.
 */
export default defineConfig({
  testDir: "tests/tunnel-e2e",
  globalSetup: "tests/tunnel-e2e/global-setup.ts",
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: { ...base.use, baseURL: "http://localhost:3123" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npx next start -p 3123",
      url: "http://localhost:3123/login",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...TEST_ENV, ...TUNNEL_E2E.controlPlaneEnv, ALLOW_TEST_EMAIL_TRANSPORT: "1", AUTH_RATE_LIMIT: "off" },
    },
    {
      command: "node tunnel/gateway/dist/gateway.js",
      url: `http://127.0.0.1:${TUNNEL_E2E.adminPort}/healthz`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: TUNNEL_E2E.gatewayEnv,
    },
    {
      command: "npx next dev examples/next-app -p 4310",
      url: "http://localhost:4310/",
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: "npx vite examples/vite-app",
      url: "http://localhost:5174/",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
