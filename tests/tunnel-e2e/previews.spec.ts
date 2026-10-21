import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { createUserOnDashboard } from "../e2e/helpers";
import { runCli } from "./cli";
import { TUNNEL_E2E } from "./env";

// Preview links use the local test CA, which isn't installed in Playwright's Chromium.
test.use({ ignoreHTTPSErrors: true });

const SHARE_URL = /Preview link\s+(https:\/\/([a-z2-7]{12})\.preview\.localhost:8643)/;

async function login(page: Page) {
  const login = runCli(["login", "--no-browser"]);
  const [verifyUrl] = await login.waitFor(/http:\/\/localhost:3123\/cli\/activate\?code=\S+/);
  await page.goto(verifyUrl);
  await page.getByRole("button", { name: "Authorize CLI" }).click();
  await expect(page.getByRole("heading", { name: "CLI authorized" })).toBeVisible();
  expect(await login.exited).toBe(0);
}

const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test("live previews dashboard: real sessions, copy/open, details, traffic, real-time status, stop, analytics", async ({ page, context, browser }) => {
  await createUserOnDashboard(page, "Preview Manager");
  await login(page);

  // ---- A real share appears in Live Previews ---------------------------------------------------
  const share = runCli(["share", "4310", "--yes"], path.join(TUNNEL_E2E.root, "examples/next-app"));
  const [, publicUrl, label] = await share.waitFor(SHARE_URL, 60_000);

  await page.goto("/dashboard/previews");
  await expect(page.getByRole("heading", { name: "Live Previews", level: 1 })).toBeVisible();
  await expect(page.getByText("Monitor and manage the applications you're sharing.")).toBeVisible();
  const row = page.locator("[data-testid=preview-card]", { hasText: label });
  await expect(row).toBeVisible();
  await expect(row.locator("[data-status]")).toHaveText("Connected");
  await expect(row).toContainText(":4310");
  await expect(page.getByTestId("stat-Active Previews")).toHaveText("1");
  await expect(page.locator("[data-live-mode=live]")).toBeVisible();

  // Copy uses the real Clipboard API.
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3123" });
  await row.getByRole("button", { name: /Copy preview link/ }).click();
  await expect(row.getByRole("button", { name: /Copy preview link/ })).toContainText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(publicUrl);

  // Open goes to the real preview in a new tab.
  const [popup] = await Promise.all([page.waitForEvent("popup"), row.getByRole("link", { name: /Open preview/ }).click()]);
  await popup.waitForLoadState();
  expect(popup.url().startsWith(publicUrl)).toBe(true);
  await expect(popup.getByTestId("headline")).toContainText("Sample store");
  for (let i = 0; i < 4; i++) await popup.reload();
  await popup.close();

  // Search and filters.
  await page.getByLabel("Search by project name or preview URL").fill("next-sample");
  await expect(page).toHaveURL(/q=next-sample/);
  await expect(row).toBeVisible();
  await page.getByRole("button", { name: "Historical" }).click();
  await expect(page.getByText("No previews match.")).toBeVisible();
  await page.getByRole("button", { name: "Connected", exact: true }).click();
  await expect(row).toBeVisible();

  // ---- Details: connection info, measured traffic, timeline, CLI command ------------------------
  await row.getByText("More details").click();
  await row.getByRole("link", { name: /View details/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/previews\/[a-z0-9]+$/);
  await expect(page.getByTestId("preview-url")).toHaveText(publicUrl);
  await expect(page.getByTestId("timeline")).toContainText("Connected");
  await expect(page.getByTestId("timeline")).toContainText("Session created");
  await expect(page.getByText("localhost:4310").first()).toBeVisible();
  // The gateway reports every 3 s in this test setup; the page updates without a reload.
  await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 1));
  await expect.poll(async () => Number((await page.getByTestId("traffic-Total requests").textContent())?.replace(/,/g, "")), { timeout: 20_000 }).toBeGreaterThanOrEqual(5);
  expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(1);
  await expect(page.getByText(/localians share 4310 --project [a-z0-9]+/)).toBeVisible();
  const detailUrl = page.url();

  // ---- Real-time: a second tab sees changes without reloading ----------------------------------
  const watcher = await context.newPage();
  await watcher.goto("/dashboard/previews");
  await watcher.evaluate(() => ((window as unknown as { __marker: number }).__marker = 2));
  await expect(watcher.locator("[data-live-mode=live]")).toBeVisible();

  const second = runCli(["share", "5174", "--yes"], path.join(TUNNEL_E2E.root, "examples/vite-app"));
  const [, , secondLabel] = await second.waitFor(SHARE_URL, 60_000);
  const secondRow = watcher.locator("[data-testid=preview-card]", { hasText: secondLabel });
  await expect(secondRow.locator("[data-status]")).toHaveText("Connected", { timeout: 20_000 }); // new session appeared live

  // Kill the second CLI: the tunnel drops and the watcher shows it as offline, live.
  second.proc.kill();
  await second.exited;
  await expect(secondRow.locator("[data-status]")).toHaveText(/Reconnecting|Connecting/, { timeout: 20_000 });
  expect(await watcher.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(2);

  // ---- Stop from the dashboard (details page) ---------------------------------------------------
  const visitor = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
  expect((await visitor.goto(publicUrl))?.status()).toBe(200);

  await page.goto(detailUrl);
  await page.getByRole("button", { name: /^Stop sharing/ }).click();
  const dialog = page.getByRole("dialog", { name: "Stop this preview?" });
  await expect(dialog).toContainText("Anyone using this link will lose access to the local application. You can start a new sharing session from your terminal.");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Stop Sharing" }).click();
  await expect(page.getByText("Sharing stopped. The link no longer reaches your app.")).toBeVisible();
  await expect(page.locator("header + main [data-status]").first()).toHaveText("Revoked");

  // The gateway really stopped forwarding, and the CLI exits without reconnecting.
  expect((await visitor.goto(publicUrl))?.status()).toBe(404);
  await expect(visitor.getByRole("heading", { name: "This preview link isn't active" })).toBeVisible();
  expect(await share.exited).not.toBe(0);
  expect(share.output).toMatch(/stopped from the Localians dashboard/);

  // The watcher tab updated live.
  await expect(watcher.locator("[data-testid=preview-card]", { hasText: label }).locator("[data-status]")).toHaveText("Revoked", { timeout: 20_000 });
  expect(await watcher.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(2);
  await watcher.close();

  // ---- Project page, overview and analytics reflect the same real data --------------------------
  await page.goto("/dashboard/projects");
  await page.getByRole("link", { name: /next-sample-app/ }).click();
  await expect(page.getByRole("heading", { name: "Project Previews" })).toBeVisible();
  await expect(page.locator("[data-testid=preview-card]", { hasText: label }).locator("[data-status]")).toHaveText("Revoked");

  await page.goto("/dashboard");
  await expect(page.getByTestId("recent-activity")).toContainText("Stopped from the dashboard");
  await expect(page.getByTestId("stat-Total Requests")).not.toHaveText("0");

  await page.goto("/dashboard/analytics?range=24h");
  await expect(page.getByRole("heading", { name: "Analytics", level: 1 })).toBeVisible();
  await expect.poll(async () => Number((await page.getByTestId("stat-Total Requests").textContent())?.replace(/,/g, ""))).toBeGreaterThanOrEqual(5);
  await expect(page.getByRole("group", { name: /Requests over time/ })).toBeVisible();
  await expect(page.getByTestId("breakdown-table")).toContainText("next-sample-app");
  // Keyboard access to the chart values.
  await page.getByRole("group", { name: /Requests over time/ }).focus();
  await page.keyboard.press("End");
  await expect(page.locator("figure").first().getByText(/UTC$/)).toBeVisible();

  // ---- Mobile layout ------------------------------------------------------------------------
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of ["/dashboard/previews", detailUrl, "/dashboard/analytics", "/dashboard"]) {
    await page.goto(url);
    expect(await noHorizontalOverflow(page), `${url} overflows at 390px`).toBe(true);
  }
  await page.goto("/dashboard/previews");
  await expect(page.locator("[data-testid=preview-card]", { hasText: label })).toBeVisible();

  const logout = runCli(["logout"]);
  expect(await logout.exited).toBe(0);
});
