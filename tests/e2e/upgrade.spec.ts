import { expect, test, type Locator, type Page } from "@playwright/test";
import { createProject, createUserOnDashboard, expectNoHorizontalOverflow, sql } from "./helpers";

// Payments are on for the E2E server (test database only); nothing is charged and nothing activates without admin approval.

async function expectPaymentDetails(dialog: Locator) {
  await expect(dialog.getByTestId("order-id")).toHaveText(/^ORD-[A-Z2-9]{8}$/);
  await expect(dialog).toContainText("5 USDT");
  await expect(dialog).toContainText("BNB Smart Chain (BEP20)");
  await expect(dialog.getByTestId("wallet-address")).toHaveText("0x2f94b75535eff533378c90f8dda29cf10208b174");
  await expect(dialog.getByRole("button", { name: "Copy wallet address" })).toBeVisible();
  await expect(dialog.getByRole("img", { name: /QR code for the wallet address/ })).toBeVisible();
  await expect(dialog).toContainText("Please send your payment screenshot, transaction hash, Localians username and Order ID to hello@thinxify.com.");
  return (await dialog.getByTestId("order-id").textContent())!;
}

const orderCount = async (projectId: string) => (await sql(`SELECT count(*)::int AS n FROM upgrade_requests WHERE "projectId" = $1`, [projectId])).rows[0].n as number;

async function projectIdFromUrl(page: Page) {
  return new URL(page.url()).pathname.split("/").pop()!;
}

test("upgrade from the project page: one order however often you click, then hash, status, no activation", async ({ page, context }) => {
  await createUserOnDashboard(page, "Project Buyer");
  await createProject(page, { name: "Buyer App", port: "4500" });
  const projectId = await projectIdFromUrl(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3123" });

  const plan = page.locator("#plan");
  await plan.getByRole("button", { name: "Upgrade for $5" }).click();
  const dialog = page.getByTestId("upgrade-dialog");
  await expect(dialog).toContainText("7 more days of sharing for this project");
  await expect(dialog.getByTestId("name-status")).toContainText("is available");
  // Repeated clicks don't create duplicate orders.
  const go = dialog.getByRole("button", { name: "Continue to payment" });
  await go.dblclick();
  await go.click({ force: true, trial: false }).catch(() => undefined);
  const orderId = await expectPaymentDetails(dialog);
  expect(await orderCount(projectId)).toBe(1);

  await dialog.getByRole("button", { name: "Copy wallet address" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("0x2f94b75535eff533378c90f8dda29cf10208b174");

  // Errors are explained; a valid hash is accepted and shown as awaiting verification.
  await dialog.getByLabel("Transaction hash").fill("12345");
  await dialog.getByRole("button", { name: "Submit" }).click();
  await expect(dialog).toContainText("Paste the transaction hash");
  await dialog.getByLabel("Transaction hash").fill(`0x${"cd".repeat(32)}`);
  await dialog.getByRole("button", { name: "Submit" }).click();
  await expect(dialog.getByTestId("hash-received")).toBeVisible();
  await expect(dialog.getByTestId("order-status")).toHaveText("Awaiting verification");

  // Closing and reopening shows the same order, never a new one; no pass exists.
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("#plan").getByTestId("plan-pass-state")).toContainText(orderId);
  await page.locator("#plan").getByRole("button", { name: "View payment details" }).click();
  await expect(page.getByTestId("upgrade-dialog").getByTestId("order-id")).toHaveText(orderId);
  expect(await orderCount(projectId)).toBe(1);
  expect((await sql(`SELECT count(*)::int AS n FROM preview_passes WHERE "projectId" = $1`, [projectId])).rows[0].n).toBe(0);
});

test("upgrade from Billing settings, on a phone", async ({ page }) => {
  await createUserOnDashboard(page, "Billing Buyer");
  await createProject(page, { name: "Billing App", port: "4501" });
  const projectId = await projectIdFromUrl(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/settings/billing");
  await expect(page.getByRole("link", { name: "Billing" })).toHaveAttribute("aria-current", "page");
  const row = page.getByTestId("billing-project").filter({ hasText: "Billing App" });
  await expect(row).toContainText("Free preview available");
  await expectNoHorizontalOverflow(page);

  await row.getByRole("button", { name: "Upgrade for $5" }).click();
  const dialog = page.getByTestId("upgrade-dialog");
  await dialog.getByRole("button", { name: "Continue to payment" }).click();
  const orderId = await expectPaymentDetails(dialog);
  await expectNoHorizontalOverflow(page);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("orders-table")).toContainText(orderId);
  await expect(row).toContainText(`Order ${orderId} · Pending`);

  // Cancel is available while nothing was submitted; afterwards a new order can be started.
  await row.getByRole("button", { name: "View payment details" }).click();
  await page.getByTestId("upgrade-dialog").getByRole("button", { name: "Cancel this order" }).click();
  await expect(page.getByTestId("orders-table")).toContainText("Cancelled");
  expect((await sql(`SELECT status FROM upgrade_requests WHERE "orderId" = $1`, [orderId])).rows[0].status).toBe("CANCELLED");
  expect(await orderCount(projectId)).toBe(1);
});
