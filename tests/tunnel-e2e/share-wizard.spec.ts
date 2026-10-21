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

test("new developer shares a password-protected app: Choose Port → Run Command → Share Link", async ({ page, context, browser }) => {
  fs.rmSync(path.join(configDir, "credentials.json"), { force: true }); // a computer that has never signed in
  await createUserOnDashboard(page, "First Timer");
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3123" });

  // ---- Overview → wizard ------------------------------------------------------------------------
  await expect(page.getByRole("heading", { name: "Your localhost. Ready to share.", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Share a Local App" }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/share$/);
  for (const step of ["Choose your port", "Run this command", "Share your link"]) await expect(page.getByRole("heading", { name: step })).toBeVisible();

  // ---- 1. Choose port, name the project, protect it --------------------------------------------
  await page.getByLabel("Port", { exact: true }).fill("4310");
  await page.getByPlaceholder("Project name (optional)").fill("Client Demo");
  await page.getByRole("radio", { name: "Password" }).click();
  await expect(page.getByTestId("setup-state")).toHaveText("Enter a password (8+ characters) to get the command.");
  await expect(page.getByRole("button", { name: "Copy Command" })).toHaveCount(0); // no command that would share publicly by mistake
  await page.getByPlaceholder("Password (8+ characters)").fill("client-pass-123");
  await expect(page.getByTestId("setup-state")).toContainText("It works once, for the next 30 minutes.");

  // ---- 2. Run the command --------------------------------------------------------------------
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
  expect(share.output).toMatch(/Workspace\s+First's Workspace/);
  expect(share.output).toMatch(/Project\s+Client Demo/);
  expect(share.output).toMatch(/Access\s+Password protected/);
  expect(share.output).not.toMatch(/Choose 1|--yes/);

  // ---- 3. Share link ------------------------------------------------------------------------------
  await expect(page.getByTestId("share-preview-url")).toHaveText(publicUrl, { timeout: 20_000 });
  const result = page.getByTestId("share-result");
  await expect(result.locator("[data-status]")).toHaveText("Connected");
  await expect(result.locator("[data-access]")).toHaveText("Protected");
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
  await client.getByRole("button", { name: "Clicked 0 times" }).click();
  await expect(client.getByRole("button", { name: "Clicked 1 times" })).toBeVisible(); // JS loaded through the protected preview
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
  await expect(card).toContainText("Link expires in");
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
