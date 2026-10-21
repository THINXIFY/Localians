import { expect, test } from "@playwright/test";
import { createProject, createUserOnDashboard, expectNoHorizontalOverflow } from "./helpers";

test("Share App: project follows the port, access is clear, the command only appears when it's safe", async ({ page, context }) => {
  await createUserOnDashboard(page, "Wizard Pilot");
  const shopId = await createProject(page, { name: "Shop", port: "4310" });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3123" });

  await page.goto("/dashboard/share");
  const project = page.getByLabel("Project", { exact: true });
  const port = page.getByLabel("Port", { exact: true });
  const command = page.getByTestId("share-command");
  for (const step of ["Select project", "Enter port", "Start sharing"]) await expect(page.getByRole("heading", { name: step, level: 2 })).toBeVisible();
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
  await expect(page.getByTestId("setup-state")).toHaveText("It works once, for the next 30 minutes.");

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
