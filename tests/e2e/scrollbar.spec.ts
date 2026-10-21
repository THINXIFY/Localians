import { expect, test, type Page } from "@playwright/test";
import { createUserOnDashboard } from "./helpers";

const thumb = (page: Page) =>
  page.evaluate(() => {
    const s = getComputedStyle(document.documentElement, "::-webkit-scrollbar-thumb");
    return { bg: s.backgroundColor, border: s.borderTopColor, width: s.borderTopWidth, radius: s.borderTopLeftRadius, transition: s.transitionDuration };
  });

test("hairline scrollbar: thin, rounded, quiet at rest, lime while scrolling, back to quiet after", async ({ page }) => {
  await page.goto("/");
  const bar = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement, "::-webkit-scrollbar");
    return { width: s.width, height: s.height };
  });
  expect(bar).toEqual({ width: "10px", height: "10px" }); // grab area; only ~4px is painted (3px transparent borders)

  const rest = await thumb(page);
  expect(rest.width).toBe("3px");
  expect(parseFloat(rest.radius)).toBeGreaterThan(100); // pill
  expect(rest.bg).toMatch(/^rgba\(255, 255, 255, 0\.1/); // faint neutral: nearly invisible
  expect(rest.border).toBe("rgba(0, 0, 0, 0)");

  await page.mouse.wheel(0, 600);
  await expect(page.locator("html")).toHaveAttribute("data-scrolling", "");
  await expect.poll(async () => (await thumb(page)).bg, { timeout: 3000 }).toBe("rgb(184, 255, 59)"); // electric lime
  expect((await thumb(page)).border).toMatch(/^rgba\(184, 255, 59, 0\.2/); // the glow
  await expect(page.locator("html")).not.toHaveAttribute("data-scrolling", "", { timeout: 4000 }); // idle again
  await expect.poll(async () => (await thumb(page)).bg, { timeout: 3000 }).toMatch(/^rgba\(255, 255, 255, 0\.1/);

  // The page itself did not shift: the gutter is reserved and no horizontal scrollbar appeared.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("reduced motion removes the scrollbar transition; smooth scrolling stays native and switches off", async ({ page }) => {
  await page.goto("/");
  expect((await thumb(page)).transition).not.toBe("0s");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("smooth");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect((await thumb(page)).transition).toBe("0s");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
});

// Computed pseudo-element styles reflect :hover of the whole element once the mouse has been over the page, so the
// theme is checked through the scrollbar tokens the thumb is painted with.
// The build may minify colours to hex, so the value is resolved to rgb()/rgba() by the browser before comparing.
const token = (page: Page, name: string) =>
  page.evaluate((n) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${n})`;
    document.body.append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  }, name);

test("dashboard scrollbars follow the theme (lime-green on light) and inner scrollers light up too", async ({ page }) => {
  await createUserOnDashboard(page, "Scroll Viewer");
  expect(await token(page, "--sb-thumb")).toMatch(/^rgba\(255, 255, 255, 0\.1/);

  await page.goto("/dashboard/settings/preferences");
  await page.getByText("Light", { exact: true }).click();
  await page.reload();
  await expect.poll(() => token(page, "--sb-thumb")).toMatch(/^rgba\(14, 22, 14, 0\.1/); // dark thumb on a light page
  expect(await token(page, "--sb-live")).toBe("rgb(79, 138, 0)");

  // A nested scroll container (the sidebar nav on a short window) gets the same treatment.
  await page.setViewportSize({ width: 1280, height: 320 });
  const nav = page.locator("aside nav");
  await nav.evaluate((el) => (el.scrollTop = 40));
  await expect(nav).toHaveAttribute("data-scrolling", "");
  await expect(nav).not.toHaveAttribute("data-scrolling", "", { timeout: 4000 });
});
