import { expect, test } from "@playwright/test";
import { createProject, createUserOnDashboard, expectNoHorizontalOverflow, sql } from "./helpers";

test("Share App: project follows the port, access is clear, the command only appears when it's safe", async ({ page, context }) => {
  await createUserOnDashboard(page, "Wizard Pilot");
  const shopId = await createProject(page, { name: "Shop", port: "4310" });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3123" });

  await page.goto("/dashboard/share");
  const project = page.getByLabel("Project", { exact: true });
  const port = page.getByLabel("Port", { exact: true });
  const command = page.getByTestId("share-command");
  for (const step of ["Select project", "Configure preview", "Start sharing"]) await expect(page.getByRole("heading", { name: step, level: 2 })).toBeVisible();
  await expect(project).toHaveValue(""); // 5173: no project uses it yet → new project
  await expect(page.getByRole("radio", { name: /^Public/ })).toBeChecked();
  await expect(page.getByText("Help & advanced")).toBeVisible();
  await expect(page.getByText("Keep the command running while you share.")).toBeHidden(); // troubleshooting stays folded

  // Typing a port that a project uses selects it; another port goes back to a new project.
  await port.fill("4310");
  await expect(project).toHaveValue(shopId);
  await expect(page.getByTestId("project-hint")).toHaveText("Matched by port 4310.");
  await expect(command).toHaveText(/^\$ localians share 4310 --setup [a-z2-9]{12}$/); // unpublished CLI: no npx
  await port.fill("4311");
  await expect(project).toHaveValue("");
  await page.getByRole("button", { name: /Vite\s*5173/ }).click();
  await expect(port).toHaveValue("5173");

  // Picking a project uses its port.
  await project.selectOption({ label: "Shop · port 4310" });
  await expect(port).toHaveValue("4310");
  await expect(page.getByTestId("project-hint")).toHaveText("Your preview is added to this project.");

  // Password protection: no command until the password is long enough.
  await page.getByRole("radio", { name: /^Password/ }).check();
  await expect(page.getByTestId("setup-state")).toHaveText("Enter a password (8+ characters) to get the command.");
  await expect(page.getByRole("button", { name: "Copy Command" })).toHaveCount(0);
  await page.getByPlaceholder("Password (8+ characters)").fill("short");
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy Command" })).toHaveCount(0);
  await page.getByPlaceholder("Password (8+ characters)").fill("long-enough-1");
  await expect(page.getByTestId("setup-state")).toHaveText("Your link will work for 1 hour. The command works once, for the next 30 minutes.");

  // Copy → the result area starts waiting for the CLI.
  await expect(page.getByText("Your link appears here")).toBeVisible();
  await page.getByRole("button", { name: "Copy Command" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^localians share 4310 --setup [a-z2-9]{12}$/);
  await expect(page.getByText("Waiting for your app to connect…")).toBeVisible();
  await expect(page.getByText(/First time on this computer\? Your browser opens once — approve it for Wizard's Workspace/)).toBeVisible();

  // Keyboard: arrow keys move between the access choices.
  await page.getByRole("radio", { name: /^Password/ }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("radio", { name: /^Public/ })).toBeChecked();
  await expect(page.getByPlaceholder("Password (8+ characters)")).toBeHidden();

  // Repeat visit: the last port and project come back (a fresh one-time code each time; never the password).
  const firstCode = (await command.textContent())!.split(" ").pop();
  await page.goto("/dashboard/share");
  await expect(port).toHaveValue("4310");
  await expect(project).toHaveValue(shopId);
  await expect(command).toHaveText(/localians share 4310 --setup [a-z2-9]{12}$/);
  expect((await command.textContent())!.split(" ").pop()).not.toBe(firstCode);
  // …but an explicit ?port= wins over the remembered one.
  await page.goto("/dashboard/share?port=8080");
  await expect(port).toHaveValue("8080");
  await expect(project).toHaveValue("");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/share");
  await expect(page.getByRole("button", { name: "Copy Command" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("Share App: a save error is shown with a retry, never a usable command", async ({ page }) => {
  await createUserOnDashboard(page, "Wizard Errors");
  await page.goto("/dashboard/share");
  await expect(page.getByRole("button", { name: "Copy Command" })).toBeVisible();
  // Simulate the session ending: saving the choices now fails.
  await page.context().clearCookies();
  await page.getByLabel("Port", { exact: true }).fill("3001");
  const state = page.getByTestId("setup-state");
  await expect(state).toContainText(/sign in/i, { timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Copy Command" })).toHaveCount(0);
  await expect(state.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("Share App: choose how long the link works; the choice is saved to the setup code and remembered", async ({ page }) => {
  await createUserOnDashboard(page, "Wizard Timer");
  await page.goto("/dashboard/share");
  const options = page.getByTestId("duration-options").getByRole("radio");
  await expect(options).toHaveCount(6); // free: 5m, 15m, 30m, 1h, 12h, 24h
  await expect(page.getByRole("radio", { name: "1 hour" })).toBeChecked(); // default
  await expect(page.getByRole("radio", { name: "7 days" })).toHaveCount(0); // longer sessions come with a Preview Pass

  await page.getByRole("radio", { name: "15 minutes" }).check();
  const state = page.getByTestId("setup-state");
  await expect(state).toHaveText("Your link will work for 15 minutes. The command works once, for the next 30 minutes.");
  const code = (await page.getByTestId("share-command").textContent())!.split(" ").pop()!;
  await expect.poll(async () => (await sql(`SELECT "durationMinutes" FROM share_setups WHERE "codeHash" = encode(sha256($1::bytea), 'hex')`, [code])).rows[0]?.durationMinutes).toBe(15);

  // Keyboard: arrows move between durations.
  await page.getByRole("radio", { name: "15 minutes" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "30 minutes" })).toBeChecked();
  await expect(state).toContainText("work for 30 minutes");

  // Remembered on the next visit (with a new one-time code).
  await page.goto("/dashboard/share");
  await expect(page.getByRole("radio", { name: "30 minutes" })).toBeChecked();

  await page.setViewportSize({ width: 360, height: 780 });
  await expect(page.getByRole("radio", { name: "24 hours" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
