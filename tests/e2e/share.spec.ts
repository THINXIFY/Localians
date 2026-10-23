import { expect, test } from "@playwright/test";
import { createProject, createUserOnDashboard, expectNoHorizontalOverflow, sql } from "./helpers";

test("Share App: compact project picker, access control and port matching", async ({ page, context }) => {
  await createUserOnDashboard(page, "Wizard Pilot");
  const shopId = await createProject(page, { name: "Shop", port: "4310" });
  const blogId = await createProject(page, { name: "Blog", port: "4311" });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3123" });

  await page.goto("/dashboard/share?port=4310");
  for (const step of ["Select project", "Configure preview", "Start sharing"]) await expect(page.getByRole("heading", { name: step, level: 2 })).toBeVisible();
  const project = page.getByLabel("Project", { exact: true });
  const port = page.getByLabel("Port", { exact: true });
  const command = page.getByTestId("share-command");

  // The project that uses the port is selected; projects are listed with their ports.
  await expect(project).toHaveValue(shopId);
  await expect(project.locator("option")).toHaveText(["Blog · :4311", "Shop · :4310"]) // alphabetical;
  await expect(page.getByTestId("project-hint")).toHaveText("Matched by port 4310.");
  await expect(command).toHaveText(/^\$ localians share 4310 --setup [a-z2-9]{12}$/);
  await port.fill("4311");
  await expect(project).toHaveValue(blogId);
  // A port no project uses keeps the current project (no surprise switch to "new").
  await port.fill("5999");
  await expect(project).toHaveValue(blogId);

  // + New project reveals the name field only then.
  await expect(page.getByTestId("new-project-name")).toHaveCount(0);
  await page.getByRole("button", { name: "New project" }).click();
  await expect(page.getByTestId("new-project-name")).toBeVisible();
  await page.getByRole("button", { name: "Choose existing" }).click();
  await expect(page.getByTestId("new-project-name")).toHaveCount(0);

  // Compact access control; no command until the password is long enough.
  await expect(page.getByRole("radio", { name: "Public" })).toBeChecked();
  await page.getByRole("radio", { name: "Password protected" }).check();
  await expect(page.getByTestId("setup-state")).toHaveText("Enter a password (8+ characters) to get the command.");
  await expect(page.getByRole("button", { name: "Copy Command" })).toHaveCount(0);
  await page.getByPlaceholder("Password (8+ characters)").fill("short");
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
  await page.getByPlaceholder("Password (8+ characters)").fill("long-enough-1");
  await expect(page.getByTestId("setup-state")).toHaveText("Your link will work for up to 24 hours. The command works once, for the next 30 minutes.");
  await page.getByRole("radio", { name: "Password protected" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("radio", { name: "Public" })).toBeChecked();

  await page.getByRole("button", { name: "Copy Command" }).click();
  // (choosing a project again took its port, 4311)
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^localians share 4311 --setup [a-z2-9]{12}$/);
  await expect(page.getByText("Waiting for your app to connect…")).toBeVisible();

  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/dashboard/share");
  await expect(page.getByTestId("plan-cards")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("Share App: Free and 7-Day Pass cards show the project's state; a used project can't get a command", async ({ page }) => {
  await createUserOnDashboard(page, "Plan Viewer");
  const id = await createProject(page, { name: "Plan App", port: "4320" });
  await page.goto("/dashboard/share?port=4320");
  const free = page.getByTestId("plan-free");
  const pass = page.getByTestId("plan-pass");
  await expect(free).toContainText("Free");
  await expect(free).toContainText("Up to 24 hours");
  await expect(page.getByTestId("plan-free-state")).toContainText("One free preview per project");
  await expect(pass).toContainText("7-Day Preview Pass");
  await expect(pass).toContainText("$5 one-time · 7 days");
  await expect(pass.getByRole("button", { name: "Upgrade for $5" })).toBeVisible();

  // Auto-stop: compact select, "until it ends" by default; pass-only lengths aren't offered on Free.
  const stop = page.getByTestId("auto-stop");
  await expect(stop).toHaveValue("");
  await expect(stop.locator("option")).toHaveText(["When the free preview ends", "After 5 minutes", "After 15 minutes", "After 30 minutes", "After 1 hour", "After 12 hours"]);
  await stop.selectOption("15");
  await expect(page.getByTestId("setup-state")).toHaveText("Your link will work for 15 minutes. The command works once, for the next 30 minutes.");
  const code = (await page.getByTestId("share-command").textContent())!.split(" ").pop()!;
  await expect.poll(async () => (await sql(`SELECT "durationMinutes" FROM share_setups WHERE "codeHash" = encode(sha256($1::bytea), 'hex')`, [code])).rows[0]?.durationMinutes).toBe(15);

  // The free window is running: time left is shown.
  await sql(
    `INSERT INTO free_preview_grants (id, "projectId", "workspaceId", "userId", "startedAt", "endsAt")
     SELECT $1, id, "workspaceId", 'e2e-user', (now() AT TIME ZONE 'utc') - interval '2 hours', (now() AT TIME ZONE 'utc') + interval '22 hours' FROM projects WHERE id = $2`,
    [`g-${id}`, id],
  );
  await page.reload();
  await expect(page.getByTestId("plan-free-state")).toContainText(/2[12]h \d\dm left/);

  // Used up: no command, a clear way forward.
  await sql(`UPDATE free_preview_grants SET "startedAt" = (now() AT TIME ZONE 'utc') - interval '30 hours', "endsAt" = (now() AT TIME ZONE 'utc') - interval '6 hours' WHERE "projectId" = $1`, [id]);
  await page.reload();
  await expect(page.getByTestId("plan-free-state")).toContainText("free preview ended");
  await expect(page.getByTestId("setup-state")).toHaveText("This project's free preview has ended. Upgrade for $5 to share it for 7 more days.");
  await expect(page.getByRole("button", { name: "Copy Command" })).toHaveCount(0);

  // Upgrade: choose a custom URL, get an Order ID and the USDT (BEP20) payment details, submit the hash.
  await page.getByTestId("plan-pass").getByRole("button", { name: "Upgrade for $5" }).click();
  const dialog = page.getByTestId("upgrade-dialog");
  await expect(dialog).toContainText("$5");
  await expect(dialog).toContainText("one-time · 7 days");
  await expect(dialog.getByTestId("name-input")).toHaveValue("plan-app");
  await expect(dialog.getByTestId("name-status")).toContainText("is available");
  await dialog.getByRole("button", { name: "Get my Order ID" }).click();
  await expect(dialog.getByTestId("order-id")).toHaveText(/^ORD-[A-Z2-9]{8}$/);
  const orderId = (await dialog.getByTestId("order-id").textContent())!;
  await expect(dialog).toContainText("5 USDT");
  await expect(dialog).toContainText("BNB Smart Chain (BEP20)");
  await expect(dialog.getByTestId("wallet-address")).toHaveText("0x2f94b75535eff533378c90f8dda29cf10208b174");
  await expect(dialog.getByRole("img", { name: /QR code for the wallet address 0x2f94b75535eff533378c90f8dda29cf10208b174/ })).toBeVisible();
  await expect(dialog).toContainText("Send USDT on BNB Smart Chain (BEP20) only.");
  await expect(dialog).toContainText(
    "Please send your payment screenshot, transaction hash, Localians username and Order ID to hello@thinxify.com. Your 7-Day Preview Pass will activate after payment verification.",
  );
  await dialog.getByLabel("Transaction hash").fill("0xnot-a-hash");
  await dialog.getByRole("button", { name: "Submit" }).click();
  await expect(dialog).toContainText("Paste the transaction hash");
  const txHash = `0x${"ab".repeat(32)}`;
  await dialog.getByLabel("Transaction hash").fill(txHash);
  await dialog.getByRole("button", { name: "Submit" }).click();
  await expect(dialog).toContainText("We'll verify the transfer on BSC");
  const row = (await sql(`SELECT status, "txHash", "requestedName" FROM upgrade_requests WHERE "orderId" = $1`, [orderId])).rows[0];
  expect(row).toEqual({ status: "PENDING", txHash, requestedName: "plan-app" });
  // Nothing is unlocked by a submitted hash: still no pass, still no command.
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByTestId("plan-pass-state")).toContainText(`${orderId} · Pending`);
  await expect(page.getByRole("button", { name: "Copy Command" })).toHaveCount(0);
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
