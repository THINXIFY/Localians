import { expect, test, type Page } from "@playwright/test";
import { createProject, createUserOnDashboard, expectNoHorizontalOverflow, sql } from "./helpers";

// The dashboard's "Connect Localians CLI" commands, and managing several previews running at once.

const COMMANDS = ["login", "share 3000", "whoami", "logout", "--help"];

async function expectCommands(page: Page) {
  const list = page.getByTestId("cli-commands");
  for (const c of COMMANDS) {
    await expect(list.getByText(new RegExp(`localians ${c.replace(/[-]/g, "\\-")}$`))).toBeVisible();
    await expect(list.getByRole("button", { name: new RegExp(`^Copy: .*localians ${c.replace(/[-]/g, "\\-")}$`) })).toBeVisible();
  }
}

test("Settings → CLI and Share App show the CLI commands, sign-in status and account, never a token", async ({ page }) => {
  const user = await createUserOnDashboard(page, "Cli Person");
  await page.goto("/dashboard/settings/cli");
  const card = page.getByTestId("cli-connect");
  await expect(card.getByRole("heading", { name: "Connect Localians CLI" })).toBeVisible();
  await expect(card.getByTestId("cli-status")).toHaveText("No computer connected yet");
  await expect(card).toContainText("Windows Command Prompt, PowerShell");
  await expectCommands(page);

  // A connected computer (as after `localians login`): status and account, but no token anywhere on the page.
  const [{ id: userId, username }] = (await sql(`SELECT id, username FROM users WHERE email = $1`, [user.email])).rows;
  const [{ workspaceId }] = (await sql(`SELECT "workspaceId" FROM workspace_members WHERE "userId" = $1`, [userId])).rows;
  await sql(
    `INSERT INTO cli_credentials (id, "userId", "workspaceId", name, "tokenHash", "tokenPrefix", "expiresAt", "lastUsedAt", "createdAt")
     VALUES ($1, $2, $3, 'CLI on laptop (win32)', $4, 'lcl_abcd', now() + interval '90 days', now(), now())`,
    [`cred_${Date.now()}`, userId, workspaceId, `hash_${Date.now()}`],
  );
  await page.reload();
  await expect(card.getByTestId("cli-status")).toHaveText("Connected on 1 computer");
  await expect(card).toContainText(`Signed in as @${username}`);
  await expect(page.getByText("CLI on laptop (win32)")).toBeVisible();
  expect(await page.content()).not.toMatch(/lcl_[A-Za-z0-9_-]{8,}/); // only the short prefix, never a token

  // Share App: the same commands, folded once a computer is connected.
  await page.goto("/dashboard/share");
  const compact = page.getByTestId("cli-connect");
  await expect(compact).not.toHaveAttribute("open", "");
  await compact.getByText("Connect Localians CLI").click();
  await expectCommands(page);

  await page.setViewportSize({ width: 375, height: 800 });
  await expectNoHorizontalOverflow(page);
  await page.goto("/dashboard/settings/cli");
  await expectNoHorizontalOverflow(page);
});

test("several previews at once: live list with plan, port and status, a live count, and Share Another App", async ({ page }) => {
  const user = await createUserOnDashboard(page, "Multi Sharer");
  const web = await createProject(page, { name: "Web Shop", port: "3000" });
  const api = await createProject(page, { name: "Orders API", port: "8000" });
  const [{ id: userId }] = (await sql(`SELECT id FROM users WHERE email = $1`, [user.email])).rows;

  // Empty state: a command to start with.
  await page.goto("/dashboard/previews");
  await expect(page.getByText("Nothing shared yet.")).toBeVisible();
  await expect(page.getByRole("main").getByText(/localians share 3000$/)).toBeVisible();
  await expect(page.getByTestId("nav-live-count")).toHaveCount(0);

  // Two apps running at the same time (as two `localians share` terminals would create): one free, one on a pass.
  const seed = (projectId: string, port: number, plan: "FREE" | "PASS", label: string) =>
    sql(
      `INSERT INTO tunnel_sessions (id, "projectId", "userId", hostname, "localPort", "planTier", status, "connectedAt", "lastHeartbeatAt", "lastActivityAt", "expiresAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, 'CONNECTED', now(), now(), now(), now() + interval '5 hours', now())`,
      [`ts_${label}`, projectId, userId, label, port, plan],
    );
  const suffix = Date.now().toString(36).slice(-6);
  await seed(web, 3000, "FREE", `webshop${suffix}`);
  await seed(api, 8000, "PASS", `ordersapi${suffix}`);

  await page.goto("/dashboard/previews");
  await expect(page.getByTestId("live-count")).toHaveText("2 live");
  await expect(page.getByTestId("nav-live-count").first()).toHaveText("2");
  const cards = page.getByTestId("preview-card");
  await expect(cards).toHaveCount(2);
  const shop = cards.filter({ hasText: "Web Shop" });
  await expect(shop).toContainText("localhost:3000");
  await expect(shop.locator("[data-plan]")).toHaveText("Free");
  await expect(shop.locator("[data-status]")).toHaveText(/^(Connected|Connecting)$/); // no gateway in this suite to confirm the connection
  await expect(shop.getByRole("button", { name: /Stop/ })).toBeVisible();
  const orders = cards.filter({ hasText: "Orders API" });
  await expect(orders).toContainText("localhost:8000");
  await expect(orders.locator("[data-plan]")).toHaveText("Pass");

  // Share App lists what's live, each with its own controls, and links to sharing another.
  await page.getByRole("main").getByRole("link", { name: "Share Another App" }).click();
  await expect(page).toHaveURL(/\/dashboard\/share#share-another$/);
  const liveNow = page.getByTestId("share-live-now");
  await expect(liveNow.getByRole("heading", { name: /Live now/ })).toContainText("(2)");
  await expect(liveNow.getByTestId("preview-card")).toHaveCount(2);
  await expect(liveNow).toContainText("Stopping one leaves the others running");

  // Stopping one (from the dashboard) leaves the other live.
  await page.goto("/dashboard/previews");
  await shop.getByRole("button", { name: /Stop/ }).click();
  const confirm = page.getByRole("dialog");
  if (await confirm.isVisible().catch(() => false)) await confirm.getByRole("button", { name: /Stop/ }).last().click();
  await expect.poll(async () => (await sql(`SELECT status FROM tunnel_sessions WHERE id = $1`, [`ts_webshop${suffix}`])).rows[0].status).not.toBe("CONNECTED");
  expect((await sql(`SELECT status FROM tunnel_sessions WHERE id = $1`, [`ts_ordersapi${suffix}`])).rows[0].status).toBe("CONNECTED");
  await page.reload();
  await expect(page.getByTestId("live-count")).toHaveText("1 live");

  await page.setViewportSize({ width: 375, height: 800 });
  await expectNoHorizontalOverflow(page);
  await page.goto("/dashboard/share");
  await expectNoHorizontalOverflow(page);
});
