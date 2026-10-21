import { expect, test } from "@playwright/test";
import { createUserOnDashboard, expectNoHorizontalOverflow } from "./helpers";

// Regression checks for the approved Phase 1 marketing page.

test("landing page renders all sections without overflow", async ({ page }) => {
  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Your localhost.");
    await expect(page.locator("main > section")).toHaveCount(10);
    await expectNoHorizontalOverflow(page);
  }
});

test("CTAs point at the real auth routes", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link", { name: "Sign In" })).toHaveAttribute("href", "/login");
  await expect(nav.getByRole("link", { name: "Get Started Free" })).toHaveAttribute("href", "/signup");
  await expect(page.getByRole("link", { name: "Start Sharing Free" })).toHaveAttribute("href", "/signup");
  await expect(page.getByRole("link", { name: "Join the Free Beta" })).toHaveAttribute("href", "/signup");

  await page.goto("/sign-in");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/get-started");
  await expect(page).toHaveURL(/\/signup$/);
});

test("mobile menu, copy button and FAQ still work", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.locator("#mobile-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#mobile-menu")).toBeHidden();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator("#how-it-works").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Copy command: npx localians share 5173" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("npx localians share 5173");

  const q = page.getByRole("button", { name: "Does Localians host my application?" });
  await q.scrollIntoViewIfNeeded();
  await q.click();
  await expect(q).toHaveAttribute("aria-expanded", "true");
});

test("signed-in visitors see a Dashboard button on the landing page", async ({ page }) => {
  await createUserOnDashboard(page, "Landing Person");
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
  await expect(nav.getByRole("link", { name: "Sign In" })).toHaveCount(0);
});
