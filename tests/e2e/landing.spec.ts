import { expect, test } from "@playwright/test";
import { createUserOnDashboard, expectNoHorizontalOverflow } from "./helpers";
import { vscodeAvailability } from "@/lib/vscode-extension";

// Regression checks for the approved Phase 1 marketing page.

test("landing page renders all sections without overflow", async ({ page }) => {
  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Share your localhost.");
    await expect(page.locator("main > section")).toHaveCount(11);
    await expectNoHorizontalOverflow(page);
  }
});

test("CTAs point at the real auth routes", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link", { name: "Sign In" })).toHaveAttribute("href", "/login");
  await expect(nav.getByRole("link", { name: "Get Started Free" })).toHaveAttribute("href", "/signup");
  for (const link of await page.getByRole("link", { name: "Start Free" }).all()) await expect(link).toHaveAttribute("href", "/signup");
  await expect(page.locator("#hero-title").locator("xpath=ancestor::section").getByRole("link", { name: "See Pricing" })).toHaveAttribute("href", "/#pricing");

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
  await page.locator("#how-it-works").getByRole("button", { name: "Copy command: npx localians share 3000" }).click(); // the hero has the same button
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("npx localians share 3000");

  const q = page.getByRole("button", { name: "Does my computer need to stay online?" });
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

test("pricing: Free vs 7-Day Pass, honest about what's live, never a wallet address on the homepage", async ({ page }) => {
  await page.goto("/");
  const pricing = page.locator("#pricing");
  await expect(pricing.getByRole("heading", { name: "Free", exact: true })).toBeVisible();
  await expect(pricing.getByRole("heading", { name: "7-Day Preview Pass", exact: true })).toBeVisible();
  await expect(pricing).toContainText("$0");
  await expect(pricing).toContainText("$5");
  await expect(pricing).toContainText("not a subscription");
  await expect(pricing.getByRole("link", { name: "Start Free" })).toHaveAttribute("href", "/signup");
  const upgrade = pricing.getByRole("link", { name: "Upgrade for $5" });
  if (await upgrade.count()) await expect(upgrade).toHaveAttribute("href", "/dashboard/settings/billing"); // payments on: the dashboard checkout
  else await expect(pricing.getByTestId("pass-coming-soon")).toHaveText("Coming Soon"); // payments off: no checkout link
  await expect(page.getByTestId("plan-comparison")).toContainText("No, one-time");
  expect(await page.content()).not.toContain("0x2f94b75535eff533378c90f8dda29cf10208b174");
  // The VS Code card says Coming soon only while there is nothing to install or download.
  const { installable, downloadable } = vscodeAvailability();
  const vscodeCard = page.locator("#features").getByRole("heading", { level: 3, name: /Share from VS Code/ });
  if (installable || downloadable) await expect(vscodeCard).not.toContainText("Coming soon");
  else await expect(vscodeCard).toContainText("Coming soon");
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
});
