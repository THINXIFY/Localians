import { expect, test, type Browser } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createUserOnDashboard } from "../e2e/helpers";
import { configDir, runCli } from "./cli";
import { TUNNEL_E2E } from "./env";

const nextPage = path.join(TUNNEL_E2E.root, "examples/next-app/app/page.jsx");
const viteMessage = path.join(TUNNEL_E2E.root, "examples/vite-app/message.js");
const originals = new Map([nextPage, viteMessage].map((f) => [f, fs.readFileSync(f, "utf8")]));

test.afterAll(() => {
  for (const [file, content] of originals) fs.writeFileSync(file, content);
});

/** Visitor browser: a separate context with no Localians cookies. The local test CA isn't installed in Chromium, so certificate errors are ignored here (the CLI side does verify TLS). */
async function visitor(browser: Browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  return context.newPage();
}

test("login → share Next.js and Vite apps → HMR through the tunnel → stop → logout", async ({ page, browser }) => {
  // ---- Account + CLI login (device flow approved in the dashboard) -------------------------
  await createUserOnDashboard(page, "Tunnel Tester");

  const login = runCli(["login", "--no-browser"]);
  const [, code] = await login.waitFor(/Confirm this code in your browser: ([A-Z]{4}-[A-Z]{4})/);
  const [verifyUrl] = await login.waitFor(/http:\/\/localhost:3123\/cli\/activate\?code=\S+/);
  expect(verifyUrl).toContain(code);
  expect(login.output).not.toMatch(/lcl_/); // the token is never printed

  await page.goto(verifyUrl);
  await expect(page.getByRole("heading", { name: "Authorize the Localians CLI?" })).toBeVisible();
  await page.getByRole("button", { name: "Authorize CLI" }).click();
  await expect(page.getByRole("heading", { name: "CLI authorized" })).toBeVisible();
  expect(await login.exited).toBe(0);
  expect(login.output).toMatch(/Logged in as e2e-/);

  const credentials = fs.readFileSync(path.join(configDir, "credentials.json"), "utf8");
  expect(credentials).toMatch(/"token": "lcl_/);
  if (process.platform !== "win32") expect(fs.statSync(path.join(configDir, "credentials.json")).mode & 0o777).toBe(0o600);

  // ---- Share the Next.js dev server ---------------------------------------------------------
  const share = runCli(["share", "4310", "-v", "--yes"], path.join(TUNNEL_E2E.root, "examples/next-app"));
  const [, publicUrl] = await share.waitFor(/Preview link\s+(https:\/\/[a-z2-7]{12}\.preview\.localhost:8643)/, 60_000);
  expect(share.output).toMatch(/Status\s+● Connected/);
  expect(share.output).toMatch(/Project\s+next-sample-app/);
  expect(share.output).not.toMatch(/lcl_|eyJ/); // no CLI token, no connect JWT

  const status = runCli(["status"]);
  expect(await status.exited).toBe(0);
  expect(status.output).toContain(publicUrl);
  expect(status.output).toMatch(/Status\s+Connected/);
  expect(status.output).toMatch(/Uptime\s+\d+/);

  // ---- A visitor uses the real app through the HTTPS preview --------------------------------
  const v = await visitor(browser);
  const response = await v.goto(publicUrl);
  expect(response?.status()).toBe(200);
  await expect(v.getByTestId("headline")).toHaveText("Sample store v1");
  await expect.poll(() => v.locator("img[alt='Sample logo']").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  await v.getByRole("button", { name: "Clicked 0 times" }).click(); // client JS hydrated through the tunnel
  await expect(v.getByRole("button", { name: "Clicked 1 times" })).toBeVisible();
  await v.getByRole("button", { name: "Call API" }).click();
  await expect(v.getByTestId("api-result")).toHaveText("API says: local Next.js API route");
  await v.getByRole("link", { name: "About us" }).click();
  await expect(v.getByRole("heading", { name: "About the sample store" })).toBeVisible();
  await v.getByRole("link", { name: "Back home" }).click();
  await v.getByRole("button", { name: "Send form" }).click();
  await expect(v.getByTestId("echo")).toHaveText("Form received: hello from the form");

  // ---- Hot reload over the tunneled WebSocket (no full page reload) --------------------------
  await v.goto(publicUrl);
  await expect(v.getByTestId("headline")).toHaveText("Sample store v1");
  await v.waitForTimeout(1500); // let the HMR socket connect
  await v.evaluate(() => ((window as unknown as { __marker: number }).__marker = 42));
  fs.writeFileSync(nextPage, originals.get(nextPage)!.replace("Sample store v1", "Sample store v2 (edited locally)"));
  await expect(v.getByTestId("headline")).toHaveText("Sample store v2 (edited locally)", { timeout: 30_000 });
  expect(await v.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(42);
  expect(share.output).toMatch(/WS\s+GET\s+101/); // the HMR WebSocket went through the tunnel

  // ---- The dashboard shows the live session -------------------------------------------------
  await page.goto("/dashboard/projects");
  await page.getByRole("link", { name: /next-sample-app/ }).click();
  const projectRow = page.locator("[data-testid=preview-card]", { hasText: new URL(publicUrl).hostname });
  await expect(projectRow.locator("[data-status]")).toHaveText("Connected");
  await expect(projectRow.getByRole("link", { name: /Open preview/ })).toHaveAttribute("href", publicUrl);

  // ---- Vite app with HMR ----------------------------------------------------------------------
  const viteShare = runCli(["share", "5174", "--yes"], path.join(TUNNEL_E2E.root, "examples/vite-app"));
  const [, viteUrl] = await viteShare.waitFor(/Preview link\s+(https:\/\/[a-z2-7]{12}\.preview\.localhost:8643)/, 60_000);
  expect(viteUrl).not.toBe(publicUrl);
  const vv = await visitor(browser);
  await vv.goto(viteUrl);
  await expect(vv.locator("#message")).toHaveText("Vite message v1");
  await vv.waitForTimeout(1500);
  await vv.evaluate(() => ((window as unknown as { __marker: number }).__marker = 7));
  fs.writeFileSync(viteMessage, `export const message = "Vite message v2 (hot)";\n`);
  await expect(vv.locator("#message")).toHaveText("Vite message v2 (hot)", { timeout: 30_000 });
  expect(await vv.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(7);

  // ---- Stopping the CLI takes the preview down immediately ------------------------------------
  // (On Windows a child can't receive Ctrl+C, so this kills the process — the crash path.)
  share.proc.kill();
  await share.exited;
  await expect.poll(async () => (await v.goto(publicUrl))?.status(), { timeout: 15_000 }).toBe(404);
  await expect(v.getByRole("heading", { name: "This preview link isn't active" })).toBeVisible();
  await expect(v.getByText("Sample store")).toHaveCount(0);

  viteShare.proc.kill();
  await viteShare.exited;
  await expect.poll(async () => (await vv.goto(viteUrl))?.status(), { timeout: 15_000 }).toBe(404);

  // ---- Logout revokes the credential and removes it locally -----------------------------------
  const logout = runCli(["logout"]);
  expect(await logout.exited).toBe(0);
  expect(logout.output).toMatch(/Logged out/);
  expect(logout.output).not.toMatch(/Couldn't reach/);
  expect(fs.existsSync(path.join(configDir, "credentials.json"))).toBe(false);
  await page.goto("/dashboard/settings/cli");
  await expect(page.getByText("No CLI logins yet.")).toBeVisible();
});
