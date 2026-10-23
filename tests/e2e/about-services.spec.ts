import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./helpers";

const CONTACT = "https://thinxify.com/contact-us/"; // every service card leads to THINXIFY's contact page

test("About: hero, sections, THINXIFY link and CTAs", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Built for Developers. Made for Sharing.");
  for (const h of ["What is Localians?", "Great Ideas Deserve to Be Shared.", "How Localians Works", "Built by THINXIFY.", "Your Localhost. Ready to Share."]) {
    await expect(page.getByRole("heading", { level: 2, name: h })).toBeVisible();
  }
  for (const step of ["Run Your App", "Connect Localians", "Share Your Link"]) await expect(page.getByRole("heading", { level: 3, name: step })).toBeVisible();
  await expect(page.locator("main").getByRole("button", { name: "Copy command: npx localians share 3000" })).toBeVisible();

  const thinxify = page.getByRole("link", { name: "Explore THINXIFY" });
  await expect(thinxify).toHaveAttribute("href", "https://thinxify.com");
  await expect(thinxify).toHaveAttribute("target", "_blank");
  await expect(thinxify).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.getByRole("link", { name: "Start Sharing" })).toHaveAttribute("href", "/signup");
  await expect(page.getByRole("link", { name: "View Documentation" })).toHaveAttribute("href", "/docs");
  // Nothing invented about the company.
  await expect(page.locator("main")).not.toContainText(/founder|funding|customers|award/i);
});

test("Services: 18 cards in three categories, every link goes to THINXIFY in a new tab", async ({ page }) => {
  await page.goto("/services");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Beyond Localhost. Build What's Next.");
  await expect(page.locator("main")).toContainText("provided by THINXIFY, not by the Localians");
  for (const [name, n] of [["Web & Digital Experiences", 5], ["Software & Engineering", 7], ["AI, Innovation & Growth", 6]] as const) {
    const group = page.locator("div[aria-labelledby]").filter({ has: page.getByRole("heading", { level: 2, name }) });
    await expect(group.getByRole("listitem")).toHaveCount(n);
  }
  const links = page.getByRole("link", { name: /^Explore Service/ });
  await expect(links).toHaveCount(18);
  for (const a of await links.all()) {
    await expect(a).toHaveAttribute("href", CONTACT);
    await expect(a).toHaveAttribute("target", "_blank");
    await expect(a).toHaveAttribute("rel", "noopener noreferrer");
  }
  // Every service is named, and the description length is the intended 12-20 words.
  for (const li of await page.locator("main li").all()) {
    const words = ((await li.locator("p").innerText()).match(/\S+/g) ?? []).length;
    expect(words).toBeGreaterThanOrEqual(12);
    expect(words).toBeLessThanOrEqual(20);
  }
  for (const label of ["Explore THINXIFY", "Work With THINXIFY"]) await expect(page.getByRole("link", { name: label })).toHaveAttribute("href", "https://thinxify.com");
  await expect(page.locator("main")).not.toContainText("/dashboard/settings/billing"); // never routed to Localians checkout
});

test("Services is in the navigation, the footer's Company column and the sitemap", async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link", { name: "Services" })).toHaveAttribute("href", "/services");
  await expect(nav.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/docs");
  await expect(page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Services" })).toHaveAttribute("href", "/services");

  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const path of ["/about", "/services"]) expect(sitemap).toContain(`${path}</loc>`);
});

test("About and Services fit at phone, tablet and desktop widths and are keyboard reachable", async ({ page }) => {
  for (const width of [360, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/about", "/services"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/services");
  const first = page.getByRole("link", { name: /^Explore Service/ }).first();
  await first.focus();
  await expect(first).toBeFocused();
});
