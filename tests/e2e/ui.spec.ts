import { expect, test } from "@playwright/test";
import { createProject, createUserOnDashboard, expectNoHorizontalOverflow } from "./helpers";

const WIDTHS = [320, 390, 820, 1024, 1440];

test("dashboard pages have no horizontal overflow at mobile, tablet and desktop widths", async ({ page }) => {
  await createUserOnDashboard(page, "Responsive Person");
  const id = await createProject(page, { name: "A project with a deliberately long name for layout testing", description: "x ".repeat(120), port: "3000" });
  const paths = [
    "/dashboard",
    "/dashboard/projects",
    "/dashboard/projects/new",
    `/dashboard/projects/${id}`,
    "/dashboard/previews",
    "/dashboard/share",
    "/dashboard/analytics",
    "/dashboard/settings/profile",
    "/dashboard/settings/security",
    "/dashboard/settings/preferences",
    "/dashboard/settings/workspace",
  ];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of paths) {
      await page.goto(path);
      await expectNoHorizontalOverflow(page);
    }
  }
});

test("auth pages have no horizontal overflow", async ({ page }) => {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/login", "/signup", "/forgot-password", "/verify-email?email=a%40b.co"]) {
      await page.goto(path);
      await expectNoHorizontalOverflow(page);
    }
  }
});

test("mobile navigation drawer works with keyboard", async ({ page }) => {
  await createUserOnDashboard(page, "Mobile Person");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Open navigation" }).click();
  const drawer = page.getByRole("dialog", { name: "Dashboard navigation" });
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();

  await page.getByRole("button", { name: "Open navigation" }).click();
  await drawer.getByRole("link", { name: "Projects" }).click();
  await expect(page).toHaveURL(/\/dashboard\/projects$/);
  await expect(drawer).toBeHidden();
});

test("user menu supports keyboard navigation", async ({ page }) => {
  await createUserOnDashboard(page, "Keyboard Person");
  const trigger = page.getByRole("button", { name: "Account menu" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Account menu" });
  await expect(menu).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Profile" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Settings" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("theme preference applies immediately and persists across reloads", async ({ page }) => {
  await createUserOnDashboard(page, "Theme Person");
  const scope = page.locator(".theme-scope");
  await expect(scope).toHaveAttribute("data-theme", "dark");

  await page.goto("/dashboard/settings/preferences");
  await page.getByText("Light", { exact: true }).click();
  await expect(scope).toHaveAttribute("data-theme", "light");
  await expect.poll(async () => page.evaluate(() => getComputedStyle(document.querySelector(".theme-scope")!).getPropertyValue("--bg").trim())).toBe("#f6f7f3");

  await page.reload();
  await expect(scope).toHaveAttribute("data-theme", "light"); // rendered server-side: no flash
  await page.goto("/dashboard");
  await expect(scope).toHaveAttribute("data-theme", "light");

  await page.goto("/dashboard/settings/preferences");
  await page.getByText("System", { exact: true }).click();
  // The choice applies instantly; wait for the save to finish before reloading.
  await expect(page.locator("fieldset[aria-busy=true]")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(scope).toHaveAttribute("data-theme", "system");
});

test("profile and workspace settings save to the database", async ({ page }) => {
  await createUserOnDashboard(page, "Settings Person");

  await page.goto("/dashboard/settings/profile");
  await page.getByLabel("Display name").fill("Renamed Person");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("Renamed Person");

  await page.goto("/dashboard/settings/workspace");
  await page.getByLabel("Workspace name").fill("Renamed Workspace");
  await page.getByLabel("Workspace slug").fill("Bad Slug!");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Use lowercase letters, numbers and single hyphens.")).toBeVisible();
  await page.getByLabel("Workspace slug").fill(`renamed-${Date.now()}`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Workspace updated.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("banner").getByText("Renamed Workspace")).toBeVisible();
});

test("security settings change the password with re-authentication and list sessions", async ({ page }) => {
  await createUserOnDashboard(page, "Security Person");
  await page.goto("/dashboard/settings/security");
  await expect(page.getByText("This device", { exact: true })).toBeVisible();

  await page.getByLabel("Current password").fill("not-my-password-1");
  await page.getByLabel("New password", { exact: true }).fill("Changed-password-789");
  await page.getByLabel("Confirm new password").fill("Changed-password-789");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "current password is incorrect" })).toBeVisible();

  await page.getByLabel("Current password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("Password changed.", { exact: false })).toBeVisible();
});
