import { expect, test, type Page } from "@playwright/test";
import { createUserOnDashboard, expectNoHorizontalOverflow } from "./helpers";

/** Every <img> on the page has loaded (no broken or missing assets). */
async function expectImagesLoaded(page: Page) {
  await page.waitForLoadState("load");
  const broken = await page.locator("img").evaluateAll((imgs) =>
    (imgs as HTMLImageElement[]).filter((i) => i.loading !== "lazy" && (!i.complete || i.naturalWidth === 0)).map((i) => i.currentSrc || i.src),
  );
  expect(broken).toEqual([]);
}

test("official logo, favicon, manifest and credit on the public site and auth pages", async ({ page, request }) => {
  await page.goto("/");
  const header = page.getByRole("banner");
  const logo = header.getByRole("link", { name: "Localians home" }).getByRole("img", { name: "Localians" });
  await expect(logo).toBeVisible();
  const box = (await logo.boundingBox())!;
  expect(box.width / box.height).toBeGreaterThan(5.9); // the wordmark's own proportions (6.04), never stretched
  expect(box.width / box.height).toBeLessThan(6.2);

  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("img", { name: "Localians" })).toBeVisible();
  await expect(footer).toContainText("Your localhost. Anywhere.");
  const credit = footer.getByRole("link", { name: "Thinxify Technologies" });
  await expect(credit).toHaveAttribute("href", "https://thinxify.com");
  await expect(credit).toHaveAttribute("target", "_blank");
  await expect(footer).toContainText("Developed by: Thinxify Technologies");
  await expectImagesLoaded(page);

  // Browser icons and the web app manifest.
  const hrefs = await page.locator('head link[rel="icon"], head link[rel="apple-touch-icon"], head link[rel="manifest"]').evaluateAll((links) =>
    (links as HTMLLinkElement[]).map((l) => `${l.rel}|${l.getAttribute("href")}`),
  );
  expect(hrefs.some((h) => h.startsWith("icon|/favicon.ico"))).toBe(true);
  expect(hrefs.some((h) => h.startsWith("icon|/icon.png"))).toBe(true);
  expect(hrefs.some((h) => h.startsWith("apple-touch-icon|/apple-icon.png"))).toBe(true);
  expect(hrefs.some((h) => h.startsWith("manifest|/manifest.webmanifest"))).toBe(true);
  for (const h of hrefs) {
    const res = await request.get(h.split("|")[1].split("?")[0]);
    expect(res.status(), h).toBe(200);
  }
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status(), icon.src).toBe(200);
  expect((await request.get("/images/logo/localians-logo-email.png")).headers()["content-type"]).toBe("image/png"); // the URL emails use

  for (const path of ["/login", "/signup", "/forgot-password", "/docs", "/docs/getting-started"]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: "Localians home" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Thinxify Technologies" }).first()).toBeVisible();
    await expectImagesLoaded(page);
  }

  // Mobile: the header logo fits and nothing overflows.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const mobileLogo = page.getByRole("banner").getByRole("img", { name: "Localians" });
  await expect(mobileLogo).toBeVisible();
  expect((await mobileLogo.boundingBox())!.x + (await mobileLogo.boundingBox())!.width).toBeLessThan(390);
  await expectNoHorizontalOverflow(page);
});

test("dashboard logo follows the theme; onboarding and the wizard show the brand; no credit in the sidebar", async ({ page }) => {
  await createUserOnDashboard(page, "Brand Viewer");
  const sidebar = page.locator("aside");
  const dark = sidebar.locator('img[src*="localians-logo-640"]');
  const light = sidebar.locator('img[src*="localians-logo-light-640"]');
  await expect(dark).toBeVisible();
  await expect(light).toBeHidden();
  await expect(sidebar.getByRole("link", { name: "Thinxify Technologies" })).toHaveCount(0);
  await expectImagesLoaded(page);

  await page.goto("/dashboard/settings/preferences");
  await page.getByText("Light", { exact: true }).click();
  await expect(light).toBeVisible();
  await expect(dark).toBeHidden();
  await page.reload(); // server-rendered: correct variant without a flash
  await expect(light).toBeVisible();

  await page.goto("/dashboard/share");
  await expect(page.getByRole("heading", { name: "Select project" })).toBeVisible();
  await expectImagesLoaded(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog", { name: "Dashboard navigation" }).locator('img[src*="localians-logo-light-640"]')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/cli/activate");
  await expect(page.getByRole("link", { name: "Localians home" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Thinxify Technologies" })).toBeVisible();
  await expectImagesLoaded(page);
});
