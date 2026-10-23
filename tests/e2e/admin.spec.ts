import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { TEST_DATABASE_URL } from "../setup/test-env";
import { createUserOnDashboard, expectNoHorizontalOverflow, PASSWORD, sql } from "./helpers";

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
