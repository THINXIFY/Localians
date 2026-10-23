import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { createUserOnDashboard } from "../e2e/helpers";
import { TUNNEL_E2E } from "./env";

/**
 * The VS Code extension in a real VS Code window (isolated profile + extensions folder), against the local tunnel
 * stack: Connect → approve in the browser → pick the running app → new project + password → real HTTPS preview → stop.
 * Needs a local VS Code install: LOCALIANS_VSCODE_EXECUTABLE, or the default Windows path below.
 */
const CODE = process.env.LOCALIANS_VSCODE_EXECUTABLE ?? "D:/VS Code Installed/Microsoft VS Code/Code.exe";
const SHOTS = process.env.LOCALIANS_VSCODE_SCREENSHOTS; // optional: where to save README screenshots
const nextApp = path.join(TUNNEL_E2E.root, "examples/next-app");

test.skip(!fs.existsSync(CODE), "VS Code isn't installed here (set LOCALIANS_VSCODE_EXECUTABLE)");
test.use({ ignoreHTTPSErrors: true });

async function launchVsCode() {
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

const notification = (w: Page, text: string | RegExp) => w.locator(".notifications-toasts .notification-list-item").filter({ hasText: text });
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
const shot = async (w: Page, name: string) => SHOTS && (await w.screenshot({ path: path.join(SHOTS, `${name}.png`) }));

test("VS Code: connect, find the running app, share it with a password, open it, stop it", async ({ page, context, browser }) => {
  await createUserOnDashboard(page, "Code Sharer"); // the browser where the approval happens
  const vscode = await launchVsCode();
  const w = vscode.window;
  try {
    // ---- Activity bar → welcome → Connect -----------------------------------------------------------
    await expect(w.locator(".statusbar-item", { hasText: "Localians" })).toBeVisible({ timeout: 30_000 });
    await w.locator('.activitybar [aria-label^="Localians"]').first().click();
    const welcome = w.locator(".pane-body .welcome-view");
    await expect(welcome).toContainText("Share the app running on your computer");
    await shot(w, "welcome");
    await welcome.getByRole("button", { name: "Connect to Localians" }).click();

    // The extension opens the approval page; approve it as the signed-in user.
    await expect.poll(() => vscode.openedUrls().find((u) => u.includes("/cli/activate?code=")), { timeout: 30_000 }).toBeTruthy();
    const approval = await context.newPage();
    await approval.goto(vscode.openedUrls().find((u) => u.includes("/cli/activate?code="))!);
    await approval.getByRole("button", { name: "Authorize CLI" }).click();
    await expect(approval.getByText("Your terminal carries on by itself")).toBeVisible();
    await approval.close();
    await expect(notification(w, /connected as .*Code's Workspace/)).toBeVisible({ timeout: 30_000 });

    // ---- The sidebar lists the running Next.js app (examples/next-app on :4310) ----------------------
    // (Other servers on this machine may be listed too; with more than one Next.js server running, rows show page titles.)
    const tree = w.locator(".pane-body .monaco-list");
    const appRow = tree.locator(".monaco-list-row").filter({ hasText: ":4310 · Next.js" });
    await expect(appRow).toBeVisible({ timeout: 30_000 });
    await expect(w.locator(".statusbar-item", { hasText: "Share App" })).toBeVisible();
    await shot(w, "sidebar-apps");

    // ---- Share: new project named after the app, password protected ------------------------------
    await appRow.click();
    await quickPick(w, "New project");
    await expect(w.locator(".quick-input-widget input.input")).toHaveValue("next-sample-app");
    await w.locator(".quick-input-widget input.input").press("Enter");
    const accessInput = w.locator(".quick-input-widget input.input");
    await expect(w.locator(".quick-input-widget")).toContainText("Who can open next-sample-app?");
    await shot(w, "access");
    await quickPick(w, "Password protected");
    await expect(w.locator(".quick-input-widget")).toContainText("Password for next-sample-app");
    await expect(accessInput).toHaveAttribute("type", "password");
    await accessInput.fill("vscode-pass-123");
    await accessInput.press("Enter");
    // How long the link works (1 hour is recommended and preselected).
    await expect(w.locator(".quick-input-widget")).toContainText("How long should the link work?");
    await quickPick(w, "30 minutes");

    const shared = notification(w, /Sharing next-sample-app: https:\/\/[a-z2-7]{12}\.preview\.localhost:8643/);
    await expect(shared).toBeVisible({ timeout: 60_000 });
    await expect(shared).toContainText("password protected");
    await expect(shared).toContainText(/works for (29m|30m)/);
    const publicUrl = /https:\/\/[a-z2-7]{12}\.preview\.localhost:8643/.exec((await shared.textContent()) ?? "")![0];
    await expect(tree.locator(".monaco-list-row", { hasText: "next-sample-app" }).filter({ hasText: "Connected" })).toBeVisible();
    await expect(w.locator(".statusbar-item", { hasText: "Sharing :4310" })).toBeVisible();
    await shot(w, "sharing");

    // ---- A visitor gets the password page, then the real app ----------------------------------------
    const visitor = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
    expect((await visitor.goto(publicUrl))?.status()).toBe(401);
    await visitor.getByLabel("Password").fill("vscode-pass-123");
    await visitor.getByRole("button", { name: "Open preview" }).click();
    await expect(visitor.getByTestId("headline")).toContainText("Sample store");

    // ---- The dashboard sees it as this user's live, protected preview ------------------------------
    await page.goto("/dashboard/previews");
    const card = page.locator("[data-testid=preview-card]", { hasText: new URL(publicUrl).hostname });
    await expect(card.locator("[data-access]")).toHaveText("Protected");

    // ---- Stop from VS Code ---------------------------------------------------------------------------
    await runCommand(w, "Localians: Stop Sharing");
    await expect(notification(w, "stopped sharing next-sample-app")).toBeVisible({ timeout: 20_000 });
    await expect(w.locator(".statusbar-item", { hasText: "Share App" })).toBeVisible();
    await expect.poll(async () => (await visitor.goto(publicUrl))?.status(), { timeout: 15_000 }).toBe(404);

    // ---- Sign out revokes this computer's access ------------------------------------------------------
    await runCommand(w, "Localians: Sign Out");
    await expect(notification(w, "signed out. This computer's access was revoked.")).toBeVisible({ timeout: 20_000 });
    await expect(welcome).toBeVisible();
  } catch (error) {
    await w.screenshot({ path: test.info().outputPath("vscode-failure.png") }).catch(() => undefined);
    throw error;
  } finally {
    await vscode.close();
  }
});
