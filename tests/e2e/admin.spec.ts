import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { TEST_DATABASE_URL } from "../setup/test-env";
import { createProject, createUserOnDashboard, expectNoHorizontalOverflow, PASSWORD, sql } from "./helpers";

// Test-only credentials for the throwaway test database (production admins are created with scripts/create-admin.ts
// and a privately supplied password).
const ADMIN_EMAIL = "admin-e2e@example.test";
const ADMIN_PASSWORD = "E2E-Admin-Password-2026";

test.beforeAll(() => {
  const root = path.resolve(__dirname, "..", "..");
  try {
    execFileSync(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), "scripts/create-admin.ts", "--email", ADMIN_EMAIL], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, LOCALIANS_ADMIN_PASSWORD: ADMIN_PASSWORD },
      stdio: "pipe",
    });
  } catch (error) {
    if (!String((error as { stderr?: Buffer }).stderr ?? "").includes("already exists")) throw error;
  }
});

async function adminLogin(page: Page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("the admin area is closed to visitors and to regular accounts", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole("heading", { name: "Administrator sign-in" })).toBeVisible();

  await adminLogin(page, ADMIN_EMAIL, "wrong-password-123");
  await expect(page.getByText("Invalid email or password.")).toBeVisible();

  // A regular account gets the same answer at the admin sign-in…
  const regular = await createUserOnDashboard(page, "Regular Person");
  await page.context().clearCookies();
  await adminLogin(page, regular.email, PASSWORD);
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
  // …and even signed in normally, can't reach any admin page or data.
  await page.goto("/login");
  await page.getByLabel("Email").fill(regular.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  for (const p of ["/admin", "/admin/users", "/admin/payments"]) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/admin\/login$/);
  }
});

test("admin signs in, sees the dashboard, manages users and payments, and logs out", async ({ page }) => {
  const customer = await createUserOnDashboard(page, "Listed Customer");
  await page.context().clearCookies();

  await adminLogin(page);
  await expect(page).toHaveURL(/\/admin$/);
  const cards = page.getByTestId("admin-cards");
  for (const label of ["Total users", "Active previews", "Pending upgrade requests", "Verified payments"]) await expect(cards.getByText(label)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link")).toHaveText(["Overview", "Users", "Payments", "Settings"]);

  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Users" }).click();
  await page.getByLabel("Search users").fill(customer.email);
  await page.getByLabel("Search users").press("Enter");
  const table = page.getByTestId("users-table");
  await expect(table.getByRole("row")).toHaveCount(2); // header + the customer
  await expect(table).toContainText(customer.email);
  await expect(table).toContainText(/LOC-\d{6}/);
  await expect(table).not.toContainText(/password|token/i);
  await table.getByRole("link", { name: /LOC-\d{6}/ }).click();
  await expect(page.getByRole("heading", { name: "Listed Customer" })).toBeVisible();
  await page.getByLabel("Full name").fill("Renamed Customer");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Renamed Customer" })).toBeVisible();

  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Payments" }).click();
  await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("accounts from before usernames choose one before using the dashboard", async ({ page }) => {
  const user = await createUserOnDashboard(page, "Old Account");
  await sql(`UPDATE users SET username = NULL WHERE email = $1`, [user.email]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/username$/);
  await page.getByLabel("Username").fill("Bad Name!");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/letters, numbers and underscores/i).first()).toBeVisible();
  const chosen = `old_${Date.now().toString(36)}`;
  await page.getByLabel("Username").fill(chosen);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect((await sql(`SELECT username FROM users WHERE email = $1`, [user.email])).rows[0].username).toBe(chosen);
});

test("Manage Plan: upgrade one project with a confirmation, once per click, then revoke; the customer's dashboard follows", async ({ page, browser }) => {
  const customer = await createUserOnDashboard(page, "Plan Customer");
  const projectId = await createProject(page, { name: "Plan Paid App", port: "3000" });
  await createProject(page, { name: "Plan Free App", port: "3001" });
  const [{ publicId }] = (await sql(`SELECT "publicId" FROM users WHERE email = $1`, [customer.email])).rows;

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await adminLogin(admin);
  await expect(admin).toHaveURL(/\/admin$/);
  await admin.goto(`/admin/users/${publicId}`);
  const panel = admin.getByTestId("plan-panel");
  await expect(panel.getByTestId("plan-project")).toHaveCount(2);
  await expect(panel.getByTestId("plan-project").filter({ hasText: "Plan Paid App" })).toContainText("Free");
  await expect(admin.getByTestId("payment-history")).toHaveCount(0); // no orders yet

  await panel.getByRole("button", { name: "Upgrade Plan Paid App" }).click();
  const dialog = admin.getByTestId("plan-dialog");
  await expect(dialog).toContainText(publicId);
  await expect(dialog.getByLabel("Verified payment")).toBeDisabled(); // no verified order for this project
  await dialog.getByLabel("Support adjustment").check();
  await expect(dialog.getByRole("button", { name: "Continue" })).toBeDisabled(); // explanation required
  await dialog.getByLabel("Explanation", { exact: true }).fill("Compensation for the gateway outage");
  await dialog.getByRole("button", { name: "Continue" }).click();
  const confirm = admin.getByTestId("plan-confirm");
  await expect(confirm).toContainText("Plan Paid App");
  await expect(confirm).toContainText("7-Day Preview Pass (this project only)");
  await expect(confirm).toContainText("Support adjustment");
  await expect(confirm).toContainText("Now");
  // A double click still activates one pass.
  await admin.getByTestId("plan-confirm-button").dblclick();
  await expect(admin.getByTestId("plan-message")).toContainText("7-Day Preview Pass activated for Plan Paid App");
  const paidRow = panel.getByTestId("plan-project").filter({ hasText: "Plan Paid App" });
  await expect(paidRow).toContainText("Paid");
  await expect(paidRow.getByTestId("plan-pass")).toContainText("Support adjustment — Compensation for the gateway outage");
  await expect(panel.getByTestId("plan-project").filter({ hasText: "Plan Free App" })).toContainText("Free");
  const passes = (await sql(`SELECT "grantReason", "requestId" FROM preview_passes WHERE "projectId" = $1`, [projectId])).rows;
  expect(passes).toEqual([{ grantReason: "SUPPORT_ADJUSTMENT", requestId: null }]);

  // The customer's dashboard shows the pass on that project.
  await page.goto(`/dashboard/projects/${projectId}`);
  await expect(page.locator("#plan").getByTestId("plan-pass-state")).toContainText("Active");

  await admin.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(admin);
  await admin.setViewportSize({ width: 1280, height: 900 });

  await paidRow.getByRole("button", { name: "Revoke…" }).click();
  await expect(admin.getByRole("button", { name: "Revoke pass" })).toBeDisabled();
  await admin.getByLabel("Reason (sent to the customer and kept in the audit log)").fill("Issued by mistake");
  await admin.getByRole("button", { name: "Revoke pass" }).click();
  await expect(admin.getByTestId("plan-message")).toContainText("Pass revoked on Plan Paid App");
  await expect(paidRow).toContainText("Free");
  await page.reload();
  await expect(page.locator("#plan").getByTestId("plan-pass-state")).not.toContainText("Active");
  await adminContext.close();
});
