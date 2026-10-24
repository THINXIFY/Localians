import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./helpers";
import { CONSENT_STORAGE_KEY, GA_MEASUREMENT_ID } from "@/lib/analytics";

// The Google tag is on every page, in Consent Mode: analytics storage stays denied until the visitor accepts.

test.use({ storageState: { cookies: [], origins: [] } }); // a first-time visitor
test.beforeEach(async ({ page }) => {
  // Google's script itself isn't under test (and tests stay offline): serve an empty one.
  await page.route("https://www.googletagmanager.com/**", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
});

/** The gtag() calls made so far, e.g. [["consent","default",{...}], ["js", ...], ["config","G-…"]]. */
const gtagCalls = (page: Page) =>
  page.evaluate(() => ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).map((entry) => JSON.parse(JSON.stringify(Array.from(entry))) as unknown[]));

test("one Google tag at the top of <head> on every kind of page, consent denied by default", async ({ page }) => {
  for (const path of ["/", "/pricing", "/vscode-extension", "/docs", "/privacy-policy", "/login", "/admin/login"]) {
    await page.goto(path);
    expect(await page.locator(`script[src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"]`).count(), path).toBe(1);
    // The consent default is the first inline script in <head> (React hoists async external scripts above it; the
    // Google tag runs its queue in order either way), and it comes before the tag is configured.
    const first = await page.evaluate(() => [...document.head.querySelectorAll("script:not([src])")].map((s) => s.textContent ?? "").find((t) => t.trim()) ?? "");
    expect(first, path).toContain("gtag('consent','default'");
    const calls = await gtagCalls(page);
    const iDefault = calls.findIndex((c) => c[0] === "consent" && c[1] === "default");
    const iConfig = calls.findIndex((c) => c[0] === "config" && c[1] === GA_MEASUREMENT_ID);
    expect(iDefault).toBeGreaterThanOrEqual(0);
    expect(iConfig).toBeGreaterThan(iDefault);
    expect(calls[iDefault][2]).toMatchObject({ analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    expect(calls.some((c) => c[0] === "consent" && c[1] === "update")).toBe(false);
  }
});

test("Accept turns analytics on and is remembered; Cookie settings reopens it; Decline turns it off", async ({ page }) => {
  await page.goto("/");
  const banner = page.getByTestId("cookie-banner");
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy-policy#cookies");

  await banner.getByRole("button", { name: "Accept" }).click();
  await expect(banner).toBeHidden();
  expect(await page.evaluate((k) => localStorage.getItem(k), CONSENT_STORAGE_KEY)).toBe("granted");
  expect((await gtagCalls(page)).at(-1)).toEqual(["consent", "update", { analytics_storage: "granted" }]);

  // Next visit: no banner, and the stored Accept is applied before the tag is configured.
  await page.goto("/pricing");
  await expect(page.locator("main")).toBeVisible();
  await expect(banner).toBeHidden();
  const calls = await gtagCalls(page);
  const iGrant = calls.findIndex((c) => c[0] === "consent" && c[1] === "update" && (c[2] as { analytics_storage?: string }).analytics_storage === "granted");
  expect(iGrant).toBeGreaterThan(0);
  expect(iGrant).toBeLessThan(calls.findIndex((c) => c[0] === "config"));

  await page.getByRole("contentinfo").getByRole("button", { name: "Cookie settings" }).click();
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Decline" }).click();
  await expect(banner).toBeHidden();
  expect(await page.evaluate((k) => localStorage.getItem(k), CONSENT_STORAGE_KEY)).toBe("denied");
  expect((await gtagCalls(page)).at(-1)).toEqual(["consent", "update", { analytics_storage: "denied" }]);
  await page.reload();
  await expect(page.locator("main")).toBeVisible();
  await expect(banner).toBeHidden();
  expect((await gtagCalls(page)).some((c) => c[0] === "consent" && c[1] === "update")).toBe(false);
});

test("the banner fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  const banner = page.getByTestId("cookie-banner");
  await expect(banner).toBeVisible();
  const box = (await banner.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  await expectNoHorizontalOverflow(page);
});
