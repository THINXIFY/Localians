import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./helpers";

// Contact, Privacy Policy and Terms of Service: content, routes, SEO and layout.

const MAIL = "mailto:hello@thinxify.com";

test("contact page offers only the email address", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Get in Touch.");
  await expect(page.getByText("Have a question about Localians, need technical assistance")).toBeVisible();
  await expect(page.getByRole("link", { name: "Email Us" })).toHaveAttribute("href", MAIL);
  const main = page.locator("main");
  await expect(main.locator("form, input, textarea")).toHaveCount(0);
  await expect(main).not.toContainText(/whatsapp|\+\d{6,}/i);
  await expect(main.locator('a[href^="tel:"], a[href*="twitter.com"], a[href*="linkedin.com"], a[href*="facebook.com"], a[href*="instagram.com"], a[href*="github.com"]')).toHaveCount(0);
});

for (const [path, title, sectionCount] of [
  ["/privacy-policy", "Privacy Policy", 14],
  ["/terms", "Terms of Service", 16],
] as const) {
  test(`${title}: effective date, contact, table of contents and sections`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.locator("main")).toContainText("Effective date: October 23, 2026");
    await expect(page.getByRole("main").getByRole("link", { name: "hello@thinxify.com" }).first()).toHaveAttribute("href", MAIL);
    await expect(page.locator("main section[id]")).toHaveCount(sectionCount);
    // Each table-of-contents link points at a real section.
    const targets = await page.locator('nav[aria-label="On this page"] a[href^="#"]').evaluateAll((links) => (links as HTMLAnchorElement[]).map((a) => a.getAttribute("href")!.slice(1)));
    expect(new Set(targets).size).toBe(sectionCount);
    for (const id of targets) expect(await page.locator(`section[id="${id}"]`).count(), id).toBe(1);
  });
}

test("privacy policy tells the truth about analytics, preview traffic and payments", async ({ page }) => {
  await page.goto("/privacy-policy");
  const main = page.locator("main");
  await expect(main).toContainText("does not use Google Analytics");
  await expect(main).toContainText("Preview content passes through our servers");
  await expect(main).toContainText("public and permanent");
  await expect(main).not.toContainText("100% secure");
});

test("terms: free window and the $5 7-Day Pass, honest about whether payments are open", async ({ page }) => {
  await page.goto("/terms");
  const main = page.locator("main");
  await expect(main).toContainText("one free preview window of up to 24 hours");
  await expect(main).toContainText("$5 (US dollars), paid once");
  await expect(main).toContainText("BNB Smart Chain (BEP20)");
  await expect(main).not.toContainText("0x2f94b755"); // never a wallet address on a public page
});

test("the old /privacy URL permanently redirects to /privacy-policy; footer links reach all three pages", async ({ page, request }) => {
  const res = await request.get("/privacy", { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers()["location"]).toBe("/privacy-policy");

  await page.goto("/about");
  const footer = page.getByRole("navigation", { name: "Footer" });
  await expect(footer.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy-policy");
  await expect(footer.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
  await expect(footer.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "/contact");
});

test("legal pages are canonical, indexable and in the sitemap", async ({ page, request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const path of ["/contact", "/privacy-policy", "/terms"]) {
    await page.goto(path);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${path}$`));
    expect(await page.locator('meta[name="robots"]').getAttribute("content")).not.toContain("noindex");
    expect(sitemap).toContain(`${path}</loc>`);
  }
  expect(sitemap).not.toContain("/privacy</loc>");
});

test("legal pages fit at phone, tablet and desktop widths", async ({ page }) => {
  for (const width of [360, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/contact", "/privacy-policy", "/terms"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  }
});
