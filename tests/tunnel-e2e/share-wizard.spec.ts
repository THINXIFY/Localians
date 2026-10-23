import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createUserOnDashboard } from "../e2e/helpers";
import { configDir, runCli } from "./cli";
import { TUNNEL_E2E } from "./env";

test.use({ ignoreHTTPSErrors: true });

const nextApp = path.join(TUNNEL_E2E.root, "examples/next-app");
const nextPage = path.join(nextApp, "app/page.jsx");
const original = fs.readFileSync(nextPage, "utf8");
test.afterAll(() => fs.writeFileSync(nextPage, original));

test("new developer shares a password-protected app: Select Project → Enter Port → Start Sharing", async ({ page, context, browser }) => {
  fs.rmSync(path.join(configDir, "credentials.json"), { force: true }); // a computer that has never signed in
  await createUserOnDashboard(page, "First Timer");
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3123" });

  // ---- Overview → wizard ------------------------------------------------------------------------
  await expect(page.getByRole("heading", { name: "Your localhost. Ready to share.", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Share a Local App" }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/share$/);
  for (const step of ["Select project", "Configure preview", "Start sharing"]) await expect(page.getByRole("heading", { name: step })).toBeVisible();

  // ---- 1–2. New project, password protected, port ------------------------------------------------
  await expect(page.getByLabel("Project", { exact: true })).toHaveValue(""); // new project
  await page.getByPlaceholder("Project name (optional)").fill("Client Demo");
  await page.getByRole("radio", { name: /^Password/ }).click();
  await page.getByLabel("Port", { exact: true }).fill("4310");
  await expect(page.getByTestId("setup-state")).toHaveText("Enter a password (8+ characters) to get the command.");
  await expect(page.getByRole("button", { name: "Copy Command" })).toHaveCount(0); // no command that would share publicly by mistake
  await page.getByPlaceholder("Password (8+ characters)").fill("client-pass-123");
  await page.getByRole("radio", { name: "15 minutes" }).check(); // how long the link works
  await expect(page.getByTestId("setup-state")).toHaveText("Your link will work for 15 minutes. The command works once, for the next 30 minutes.");

  // ---- 3. Start sharing: copy and run the command ------------------------------------------------
  const command = page.getByTestId("share-command");
  await expect(command).toHaveText(/localians share 4310 --setup [a-z2-9]{12}$/);
  await page.getByRole("button", { name: "Copy Command" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^localians share 4310 --setup [a-z2-9]{12}$/);
  await expect(page.getByText("First time on this computer?")).toContainText("First's Workspace");

  const wrong = runCli(["share", "4399"], nextApp);
  expect(await wrong.exited).toBe(4);
  expect(wrong.output).toContain("We couldn't find a website running on port 4399. Start your app and try again.");

  // First run on a new computer: the browser approval opens (here: we follow the link), then it carries on by itself.
  const args = copied.replace(/^localians\s+/, "").split(/\s+/);
  const share = runCli([...args, "--no-browser"], nextApp);
  await share.waitFor(/First, connect this computer to your Localians account/);
  const [verifyUrl] = await share.waitFor(/http:\/\/localhost:3123\/cli\/activate\?code=\S+/);
  const approval = await context.newPage();
  await approval.goto(verifyUrl);
  await expect(approval.getByText("First's Workspace")).toBeVisible(); // the workspace is shown before approving
  await approval.getByRole("button", { name: "Authorize CLI" }).click();
  await expect(approval.getByText("Your terminal carries on by itself")).toBeVisible();
  await approval.close();

  // No project prompt, no --yes: the setup code already says what to do.
  const [, publicUrl] = await share.waitFor(/Preview link\s+(https:\/\/[a-z2-7]{12}\.preview\.localhost:8643)/, 60_000);
  await share.waitFor(/Press Ctrl\+C to stop sharing\./); // the whole banner has arrived
  expect(share.output).toMatch(/Workspace\s+First's Workspace/);
  expect(share.output).toMatch(/Project\s+Client Demo/);
  expect(share.output).toMatch(/Access\s+Password protected/);
  expect(share.output).toMatch(/Expires\s+in 1[45]m \d\ds \(at /); // the dashboard's 15 minutes, carried by the setup code
  expect(share.output).not.toMatch(/Choose 1|--yes/);

  // ---- The link appears by itself, with Copy and Open; the used command is gone ---------------------
  await expect(page.getByTestId("share-preview-url")).toHaveText(publicUrl, { timeout: 20_000 });
  await expect(command).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Start sharing" }).locator("..").getByRole("link", { name: "Open" })).toHaveAttribute("href", publicUrl);
  const result = page.getByTestId("share-result");
  await expect(result.locator("[data-status]")).toHaveText("Connected");
  await expect(result.locator("[data-access]")).toHaveText("Protected");
  await expect(result.getByTestId("countdown")).toContainText(/Expires in 1[45]m \d\ds/);
  await result.getByRole("button", { name: "Copy Link" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(publicUrl);

  // ---- The client: password page, then the real app — scripts, API and hot reload all work -------
  const client = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
  const gate = await client.goto(publicUrl);
  expect(gate?.status()).toBe(401);
  await expect(client.getByRole("heading", { name: "This preview is password protected" })).toBeVisible();
  await client.getByLabel("Password").fill("wrong-password");
  await client.getByRole("button", { name: "Open preview" }).click();
  await expect(client.getByRole("alert")).toHaveText("That password isn't right. Try again.");
  await client.getByLabel("Password").fill("client-pass-123");
  await client.getByRole("button", { name: "Open preview" }).click();
  await expect(client.getByTestId("headline")).toHaveText("Sample store v1");
  // JS loaded through the protected preview (retry the click until the dev server has finished compiling and hydrated).
  await expect(async () => {
    await client.getByRole("button", { name: /Clicked \d+ times/ }).click();
    await expect(client.getByRole("button", { name: /Clicked [1-9]\d* times/ })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  await client.getByRole("button", { name: "Call API" }).click();
  await expect(client.getByTestId("api-result")).toHaveText("API says: local Next.js API route");
  await client.waitForTimeout(1500); // HMR WebSocket connects (with the access cookie)
  fs.writeFileSync(nextPage, original.replace("Sample store v1", "Sample store v3 (protected HMR)"));
  await expect(client.getByTestId("headline")).toHaveText("Sample store v3 (protected HMR)", { timeout: 30_000 });
  fs.writeFileSync(nextPage, original);

  // ---- Changing the password signs the client out immediately ------------------------------------
  await page.goto("/dashboard/projects");
  await page.getByRole("link", { name: /Client Demo/ }).click();
  const panel = page.locator("#access");
  await panel.getByLabel("New password").fill("rotated-pass-456");
  await panel.getByRole("button", { name: "Save access" }).click();
  await expect(page.getByText(/Password protection saved\. Applied to 1 live preview/)).toBeVisible();
  expect((await client.goto(publicUrl))?.status()).toBe(401);
  await expect(client.getByRole("heading", { name: "This preview is password protected" })).toBeVisible();

  // ---- The setup code was single-use --------------------------------------------------------------
  const reused = runCli(args, nextApp);
  expect(await reused.exited).not.toBe(0);
  expect(reused.output).toContain("already used");

  // ---- Stop Sharing ---------------------------------------------------------------------------------
  await page.goto("/dashboard/previews");
  const card = page.locator("[data-testid=preview-card]", { hasText: new URL(publicUrl).hostname });
  await expect(card.locator("[data-access]")).toHaveText("Protected");
  await expect(card.getByTestId("countdown")).toContainText("Expires in");
  await card.getByRole("button", { name: /^Stop sharing/ }).click();
  await page.getByRole("dialog", { name: "Stop this preview?" }).getByRole("button", { name: "Stop Sharing" }).click();
  await expect(page.getByText("Sharing stopped. The link no longer reaches your app.")).toBeVisible();
  expect((await client.goto(publicUrl))?.status()).toBe(404);
  expect(await share.exited).not.toBe(0);

  // ---- Mobile ------------------------------------------------------------------------------------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/share");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(await runCli(["logout"]).exited).toBe(0);
});

test("beginner: port + password only, run from a subfolder — project named after the app, protected, status and stop", async ({ page, context, browser }) => {
  fs.rmSync(path.join(configDir, "credentials.json"), { force: true });
  await createUserOnDashboard(page, "Second Timer");
  await page.goto("/dashboard/share");
  await page.getByLabel("Port", { exact: true }).fill("4310");
  await page.getByRole("radio", { name: /^Password/ }).click();
  await page.getByPlaceholder("Password (8+ characters)").fill("beginner-pass-1"); // no project name typed
  await expect(page.getByTestId("setup-state")).toContainText("The command works once");
  const command = ((await page.getByTestId("share-command").textContent()) ?? "").replace(/^\$\s*/, "").trim();
  expect(command).toMatch(/^localians share 4310 --setup [a-z2-9]{12}$/);

  // Run from a subfolder of the app (app/): the CLI walks up to package.json for the name.
  const share = runCli([...command.replace(/^localians\s+/, "").split(/\s+/), "--no-browser"], path.join(nextApp, "app"));
  const [verifyUrl] = await share.waitFor(/http:\/\/localhost:3123\/cli\/activate\?code=\S+/);
  const approval = await context.newPage();
  await approval.goto(verifyUrl);
  await approval.getByRole("button", { name: "Authorize CLI" }).click();
  await expect(approval.getByText("Your terminal carries on by itself")).toBeVisible();
  await approval.close();

  const [, publicUrl] = await share.waitFor(/Preview link\s+(https:\/\/[a-z2-7]{12}\.preview\.localhost:8643)/, 60_000);
  await share.waitFor(/Press Ctrl\+C to stop sharing\./); // the whole banner has arrived
  expect(share.output).toMatch(/Project\s+next-sample-app/); // not "localians-web", not "app"
  expect(share.output).toMatch(/Access\s+Password protected/);
  expect(share.output).toMatch(/Status\s+● Connected/);
  expect(share.output).toContain("Press Ctrl+C to stop sharing.");

  const client = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
  expect((await client.goto(publicUrl))?.status()).toBe(401); // the password choice was applied to the auto-named project

  const status = runCli(["status"]);
  expect(await status.exited).toBe(0);
  expect(status.output).toMatch(/Project\s+next-sample-app/);
  expect(status.output).toContain(publicUrl);

  // The wizard shows the live link; stopping it there shows the stopped state and a one-click restart.
  await expect(page.getByTestId("share-preview-url")).toHaveText(publicUrl, { timeout: 20_000 });
  await expect(page.getByTestId("share-result").locator("[data-access]")).toHaveText("Protected");
  await page.getByRole("button", { name: "Stop sharing next-sample-app" }).click();
  await page.getByRole("dialog", { name: "Stop this preview?" }).getByRole("button", { name: "Stop Sharing" }).click();
  await expect(page.getByText("Sharing stopped", { exact: true })).toBeVisible({ timeout: 15_000 });
  expect(await share.exited).not.toBe(0);
  const oldCode = command.split(" ").pop();
  await page.getByRole("button", { name: "Share again" }).click();
  const fresh = page.getByTestId("share-command");
  await expect(fresh).toHaveText(/localians share 4310 --setup [a-z2-9]{12}$/); // remembered port, new one-time code
  expect((await fresh.textContent())!.split(" ").pop()).not.toBe(oldCode);
  await expect(page.getByLabel("Project", { exact: true })).toHaveValue(/.+/); // and the project it created
  await expect(page.getByRole("radio", { name: /^Password/ })).toBeChecked();
  await expect(page.getByPlaceholder("Keep the current password")).toBeVisible();

  await page.goto("/dashboard/projects");
  await expect(page.getByRole("link", { name: /next-sample-app/ })).toBeVisible();
  expect(await runCli(["logout"]).exited).toBe(0);
});
