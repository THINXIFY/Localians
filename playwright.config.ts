import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TEST_ENV } from "./tests/setup/test-env";

/**
 * Uses an already-installed Playwright Chromium when the bundled revision isn't
 * downloaded (set PW_CHROMIUM_PATH to override, or run `npx playwright install chromium`).
 */
function chromiumExecutable(): string | undefined {
  if (process.env.PW_CHROMIUM_PATH) return process.env.PW_CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(os.homedir(), process.platform === "win32" ? "AppData/Local/ms-playwright" : ".cache/ms-playwright");
  if (!fs.existsSync(root)) return undefined;
  const dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort();
  for (const dir of dirs.reverse()) {
    for (const exe of ["chrome-win64/chrome.exe", "chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
      const candidate = path.join(root, dir, exe);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

const PORT = 3123;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: { executablePath: chromiumExecutable() },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Runs the production build (`npm run build` first) against the test database.
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...TEST_ENV,
      // Production mode refuses non-Resend transports unless explicitly allowed for tests.
      ALLOW_TEST_EMAIL_TRANSPORT: "1",
      // Rate limiting is covered by integration tests; E2E signs up many users from one IP.
      AUTH_RATE_LIMIT: "off",
      // The customer side of 7-Day Pass requests (test database only; nothing is charged).
      PAYMENTS_ENABLED: "on",
      ADMIN_NOTIFY_EMAIL: "admin-inbox@example.test",
      // Uploaded images (avatars, payment QR codes) go to a throwaway folder, never the checkout.
      LOCALIANS_UPLOAD_DIR: path.join(os.tmpdir(), "localians-e2e-uploads"),
    },
  },
});
