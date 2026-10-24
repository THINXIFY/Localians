import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { createUserOnDashboard } from "../e2e/helpers";
import { TUNNEL_E2E } from "./env";

/**
 * The VS Code extension in a real VS Code window (isolated profile + extensions folder), against the local tunnel
 * stack, driven through its sidebar panel like a user: Sign In → approve in the browser → the running app is detected →
 * share it (new project, password) → copy / open → share a second app → stop one → sign out. Also the light theme and
 * the Getting Started walkthrough. Needs a local VS Code: LOCALIANS_VSCODE_EXECUTABLE, or the default Windows path below.
 * LOCALIANS_VSCODE_SCREENSHOTS=<folder> saves the README screenshots.
 */
const CODE = process.env.LOCALIANS_VSCODE_EXECUTABLE ?? "D:/VS Code Installed/Microsoft VS Code/Code.exe";
const SHOTS = process.env.LOCALIANS_VSCODE_SCREENSHOTS; // optional: where to save README screenshots
const nextApp = path.join(TUNNEL_E2E.root, "examples/next-app");

test.skip(!fs.existsSync(CODE), "VS Code isn't installed here (set LOCALIANS_VSCODE_EXECUTABLE)");
test.use({ ignoreHTTPSErrors: true });

async function launchVsCode(theme = "Default Dark Modern") {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localians-vscode-e2e-"));
  const urlFile = path.join(tmp, "opened-url.txt");
  // A stand-in "browser": VS Code hands it the links the extension opens, so approvals don't open the real browser.
  const browserStub = path.join(tmp, "record-url.cmd");
  fs.writeFileSync(browserStub, `@echo %~1>> "${urlFile}"\r\n`);
  fs.mkdirSync(path.join(tmp, "user", "User"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "user", "User", "settings.json"),
    JSON.stringify({
      "workbench.startupEditor": "none",
      "security.workspace.trust.enabled": false,
      "telemetry.telemetryLevel": "off",
      "update.mode": "none",
      "git.openRepositoryInParentFolders": "never",
      "workbench.secondarySideBar.defaultVisibility": "hidden",
      "chat.disableAIFeatures": true,
      "workbench.colorTheme": theme,
      "window.dialogStyle": "custom",
      "workbench.tips.enabled": false,
      "workbench.externalBrowser": browserStub,
      "localians.serverUrl": TUNNEL_E2E.apiUrl,
      "localians.extraPorts": [4310],
    }),
  );
  const port = 9300 + Math.floor(Math.random() * 500);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(VSCODE_|ELECTRON_)/.test(k))) as NodeJS.ProcessEnv;
  env.NODE_EXTRA_CA_CERTS = path.join(TUNNEL_E2E.certs, "ca.crt"); // trust the local test gateway
  const proc: ChildProcess = spawn(
    CODE,
    [
      nextApp,
      `--extensionDevelopmentPath=${path.join(TUNNEL_E2E.root, "extensions/vscode")}`,
      `--user-data-dir=${path.join(tmp, "user")}`,
      `--extensions-dir=${path.join(tmp, "extensions")}`,
      "--skip-welcome",
      "--skip-release-notes",
      "--new-window",
      `--remote-debugging-port=${port}`,
    ],
    { stdio: "ignore", env },
  );
  let browser: Browser | undefined;
  for (let i = 0; i < 90 && !browser; i++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!browser) throw new Error("VS Code didn't start");
  const window = browser.contexts()[0].pages()[0] ?? (await browser.contexts()[0].waitForEvent("page"));
  await window.waitForSelector(".monaco-workbench", { timeout: 60_000 });
  return {
    window,
    openedUrls: () => (fs.existsSync(urlFile) ? fs.readFileSync(urlFile, "utf8").split(/\r?\n/).filter(Boolean) : []),
    close: async () => {
      await browser!.close().catch(() => undefined);
      proc.kill();
      await new Promise((r) => setTimeout(r, 1500));
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
    },
  };
}

async function quickPick(w: Page, text: string) {
  const input = w.locator(".quick-input-widget input.input");
  await expect(input).toBeVisible();
  await input.fill(text);
  await w.waitForTimeout(250);
  await input.press("Enter");
}
async function runCommand(w: Page, title: string) {
  await w.keyboard.press("F1");
  await quickPick(w, `>${title}`);
}
/** README/website screenshots: the Localians sidebar by default, or the whole window. */
const shot = async (w: Page, name: string, whole = false) =>
  SHOTS && (await (whole ? w.screenshot({ path: path.join(SHOTS, `${name}.png`) }) : w.locator(".part.sidebar").screenshot({ path: path.join(SHOTS, `${name}.png`) })));
/** The Localians sidebar panel (a webview: VS Code nests it in two iframes). */
const panelOf = (w: Page) => w.frameLocator("iframe.webview.ready").frameLocator("#active-frame");
const statusItem = (w: Page, text: string | RegExp) => w.locator(".statusbar-item", { hasText: text });
const PREVIEW_URL = /https:\/\/[a-z2-7]{12}\.preview\.localhost:8643/;

test("VS Code sidebar: sign in, detect the app, share it with a password, copy/open, share a second app, stop one, sign out", async ({ page, browser }) => {
  await createUserOnDashboard(page, "Code Sharer"); // the browser where the approval happens
  const vscode = await launchVsCode();
  const w = vscode.window;
  try {
    // ---- Status bar → sidebar → welcome ----------------------------------------------------------------
    await expect(statusItem(w, "Localians: Signed Out")).toBeVisible({ timeout: 30_000 });
    await statusItem(w, "Localians: Signed Out").click();
    const panel = panelOf(w);
    await expect(panel.getByRole("heading", { name: "Welcome to Localians" })).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByText("Share your localhost apps securely in seconds.")).toBeVisible();
    await expect(panel.getByText("Getting started")).toBeVisible();
    await shot(w, "welcome");

    // ---- Sign in from the panel (keyboard): the code shows while waiting; approving updates the panel --------
    await panel.getByRole("button", { name: "Sign In to Localians" }).focus();
    await w.keyboard.press("Enter");
    await expect(panel.getByRole("heading", { name: "Waiting for sign in…" })).toBeVisible();
    const code = (await panel.locator(".code").textContent())!.trim();
    expect(code).toMatch(/^[A-Z]{4}-[A-Z]{4}$/);
    await expect(panel.getByRole("button", { name: "Copy Code" })).toBeVisible();
    await shot(w, "signing-in");
    await expect.poll(() => vscode.openedUrls().find((u) => u.includes("/cli/activate?code=")), { timeout: 30_000 }).toBeTruthy();
    const approvalUrl = vscode.openedUrls().find((u) => u.includes("/cli/activate?code="))!;
    expect(approvalUrl).toContain(code);
    const approval = await page.context().newPage();
    await approval.goto(approvalUrl);
    await approval.getByRole("button", { name: "Authorize CLI" }).click();
    await expect(approval.getByText("Your terminal carries on by itself")).toBeVisible();
    await approval.close();
    await expect(panel.getByTestId("account-status")).toContainText("Connected", { timeout: 30_000 });
    await expect(panel.locator(".who .name")).toHaveText(/^@\S+$/);
    await expect(statusItem(w, "Localians: Connected")).toBeVisible();

    // ---- The running Next.js app (:4310) is detected; a new project is suggested ---------------------------
    const appSelect = panel.getByLabel("Running app");
    await expect(appSelect.locator("option", { hasText: ":4310" })).toHaveCount(1, { timeout: 30_000 });
    await appSelect.selectOption({ label: (await appSelect.locator("option", { hasText: ":4310" }).textContent())! });
    await expect(panel.getByLabel("Project", { exact: true })).toHaveValue("__new");
    await expect(panel.getByLabel("New project name")).toHaveValue("next-sample-app");
    await expect(panel.getByTestId("plan-line")).toHaveText("New project · free 24-hour preview");
    await panel.getByText("Options").click();
    await panel.getByRole("radio", { name: /Password protected/ }).click();
    await expect(panel.getByRole("radio", { name: /Password protected/ })).toBeChecked();
    // Only free lengths without a Preview Pass.
    await expect(panel.getByLabel("Link works for").locator("option")).toHaveText(["Until the free preview ends", "5 minutes", "15 minutes", "30 minutes", "1 hour", "12 hours", "24 hours"]);
    await panel.getByLabel("Link works for").selectOption({ label: "30 minutes" });
    await shot(w, "share-form");
    await panel.getByRole("button", { name: "Share App" }).click();

    // The password is typed in VS Code's own (masked) input, never in the webview.
    const input = w.locator(".quick-input-widget input.input");
    await expect(w.locator(".quick-input-widget")).toContainText("Password for next-sample-app");
    await expect(input).toHaveAttribute("type", "password");
    await input.fill("vscode-pass-123");
    await input.press("Enter");

    const first = panel.locator("[data-testid=preview][data-port='4310']");
    await expect(first.locator(".status")).toHaveText("Live", { timeout: 60_000 });
    await expect(first).toContainText("Protected");
    await expect(first).toContainText(/(29|30)m left/);
    await expect(panel.getByTestId("notice")).toContainText("Sharing next-sample-app. The link is copied (password protected)");
    const publicUrl = `https://${(await first.locator(".url").textContent())!.trim()}`;
    expect(publicUrl).toMatch(PREVIEW_URL);
    await expect(statusItem(w, "Localians: 1 Live")).toBeVisible();
    await shot(w, "sharing");

    // Copy and open.
    await first.getByRole("button", { name: "Copy Link" }).click();
    await expect(w.locator(".statusbar-item", { hasText: "Preview link copied" })).toBeVisible();
    await first.getByRole("button", { name: "Open" }).click();
    await expect.poll(() => vscode.openedUrls().some((u) => u.replace(/\/$/, "") === publicUrl), { timeout: 10_000 }).toBe(true);

    // A visitor gets the password page, then the real app.
    const visitor = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
    expect((await visitor.goto(publicUrl))?.status()).toBe(401);
    await visitor.getByLabel("Password").fill("vscode-pass-123");
    await visitor.getByRole("button", { name: "Open preview" }).click();
    await expect(visitor.getByTestId("headline")).toContainText("Sample store");

    // ---- Share another app (Vite on :5174), publicly ------------------------------------------------------
    await panel.getByRole("button", { name: "Share Another App" }).first().click();
    await expect(panel.getByLabel("Running app")).not.toHaveValue("4310"); // moved on to an app that isn't shared yet
    await panel.getByLabel("Running app").selectOption("5174"); // (other apps may be running on this machine)
    await expect(panel.getByLabel("Project", { exact: true })).toHaveValue("__new"); // not the Next.js project on :4310
    await expect(panel.getByLabel("New project name")).not.toHaveValue("next-sample-app");
    await panel.getByRole("radio", { name: /^Public/ }).click();
    await expect(panel.getByRole("radio", { name: /^Public/ })).toBeChecked();
    await panel.getByRole("button", { name: "Share App" }).click();
    const dialog = w.locator(".monaco-dialog-box");
    await expect(dialog).toContainText("Share localhost:5174 publicly?");
    await dialog.getByRole("button", { name: "Share Publicly" }).click();
    const second = panel.locator("[data-testid=preview][data-port='5174']");
    await expect(second.locator(".status")).toHaveText("Live", { timeout: 60_000 });
    await expect(second).toContainText("Public");
    const secondUrl = `https://${(await second.locator(".url").textContent())!.trim()}`;
    expect(secondUrl).not.toBe(publicUrl);
    await expect(statusItem(w, "Localians: 2 Live")).toBeVisible();
    await expect(panel.getByRole("heading", { name: /Active Previews \(2\)/ })).toBeVisible();
    await shot(w, "two-previews");

    // The same app can't be shared twice from here.
    await panel.getByLabel("Running app").selectOption("4310");
    await expect(panel.getByText("This app is already being shared. Open its active preview below.")).toBeVisible();

    // ---- Stop one: the other keeps running -------------------------------------------------------------------
    await first.getByRole("button", { name: "Stop" }).click();
    await expect(panel.getByTestId("notice")).toContainText("Stopped sharing next-sample-app");
    await expect(first).toHaveCount(0);
    await expect.poll(async () => (await visitor.goto(publicUrl))?.status(), { timeout: 15_000 }).toBe(404);
    expect((await visitor.goto(secondUrl))?.status()).toBe(200);
    await expect(second.locator(".status")).toHaveText("Live");
    await expect(statusItem(w, "Localians: 1 Live")).toBeVisible();

    // The panel never scrolls sideways, even in a narrow sidebar.
    const overflow = await w.frames().find((f) => f.url().includes("panel") || f.name() === "active-frame")?.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth).catch(() => 0);
    expect(overflow ?? 0).toBeLessThanOrEqual(0);

    // ---- The dashboard sees this user's live preview -------------------------------------------------------------
    await page.goto("/dashboard/previews");
    await expect(page.locator("[data-testid=preview-card]", { hasText: new URL(secondUrl).hostname })).toBeVisible();

    // ---- Getting Started walkthrough ------------------------------------------------------------------------------
    await runCommand(w, "Localians: Getting Started");
    await expect(w.locator(".gettingStartedContainer, .getting-started-step").first()).toBeVisible({ timeout: 15_000 });
    await expect(w.getByText("Get started with Localians").first()).toBeVisible();
    await shot(w, "walkthrough", true);
    await w.keyboard.press("Control+W");

    // ---- Sign out (asks first, since a preview is live) -------------------------------------------------------------
    await panel.getByRole("button", { name: "Sign Out" }).click();
    await expect(dialog).toContainText("Signing out stops your preview.");
    await dialog.getByRole("button", { name: "Sign Out" }).click();
    await expect(panel.getByRole("heading", { name: "Welcome to Localians" })).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByTestId("notice")).toContainText("Signed out. This computer's access was revoked.");
    await expect(statusItem(w, "Localians: Signed Out")).toBeVisible();
    await expect.poll(async () => (await visitor.goto(secondUrl))?.status(), { timeout: 15_000 }).toBe(404);
  } catch (error) {
    await w.screenshot({ path: test.info().outputPath("vscode-failure.png") }).catch(() => undefined);
    throw error;
  } finally {
    await vscode.close();
  }
});

test("VS Code sidebar in the light theme: readable, uses the theme's colours", async () => {
  const vscode = await launchVsCode("Default Light Modern");
  const w = vscode.window;
  try {
    await statusItem(w, "Localians: Signed Out").click({ timeout: 30_000 });
    const panel = panelOf(w);
    const heading = panel.getByRole("heading", { name: "Welcome to Localians" });
    await expect(heading).toBeVisible({ timeout: 30_000 });
    // Dark text on the light sidebar (the panel follows VS Code's theme variables).
    const color = await heading.evaluate((el) => getComputedStyle(el).color);
    const [r, g, b] = color.match(/\d+/g)!.map(Number);
    expect(r + g + b).toBeLessThan(200);
    await shot(w, "welcome-light");
  } finally {
    await vscode.close();
  }
});
