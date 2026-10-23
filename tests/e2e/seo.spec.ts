import { expect, test } from "@playwright/test";
import { indexablePaths } from "@/lib/site";

// Search-engine regressions: verification, indexing rules, canonical URLs, metadata and structured data.

/**
 * The site origin the build was made for (NEXT_PUBLIC_SITE_URL, baked into static pages at build time): read from
 * robots.txt, then everything else must agree with it. Production builds are forced to https://localians.com by
 * scripts/check-production-env.mjs.
 */
let BASE = "";
test.beforeAll(async ({ request }) => {
  const sitemapLine = (await (await request.get("/robots.txt")).text()).match(/Sitemap: (\S+)/)?.[1];
  expect(sitemapLine).toMatch(/^https?:\/\/[^/]+\/sitemap\.xml$/);
  BASE = new URL(sitemapLine!).origin;
});
const pick = (html: string, re: RegExp) => html.match(re)?.[1] ?? null;
const jsonLd = (html: string) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
    const value = JSON.parse(m[1]) as Record<string, unknown> | Record<string, unknown>[];
    return Array.isArray(value) ? value : [value];
  });

test("the Google Search Console verification tag is in the homepage HTML", async ({ request }) => {
  const html = await (await request.get("/")).text();
  expect(html).toContain('<meta name="google-site-verification" content="iXvhd5hOPWfiz1lhpSC8k6aCHeh37V1mJVrQgw1UD1Y"/>');
});

test("robots.txt allows the public site, blocks the app and APIs, and points at the sitemap", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toMatch(/User-Agent: \*\nAllow: \//);
  for (const path of ["/api/", "/dashboard", "/onboarding", "/cli/"]) expect(body).toContain(`Disallow: ${path}\n`);
  expect(body).not.toMatch(/Disallow: \/\s*$/m); // never the whole site
  expect(body).toContain(`Sitemap: ${BASE}/sitemap.xml`);
});

test("the sitemap lists exactly the public pages, with canonical absolute URLs", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(urls).toEqual(indexablePaths.map((p) => new URL(p, BASE).toString()));
  const privatePrefixes = ["/dashboard", "/api/", "/login", "/onboarding", "/cli/"];
  for (const url of urls) expect(privatePrefixes.some((p) => new URL(url).pathname.startsWith(p)), url).toBe(false);
});

test("every public page is indexable, self-canonical, uniquely titled and well-formed", async ({ request }) => {
  const titles = new Set<string>();
  for (const path of indexablePaths) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(200);
    expect(response.headers()["x-robots-tag"], path).toBeUndefined();
    const html = await response.text();
    const url = new URL(path, BASE).toString().replace(/\/$/, "");
    expect(pick(html, /<link rel="canonical" href="([^"]+)"/)?.replace(/\/$/, ""), `${path} canonical`).toBe(url);
    expect(pick(html, /<meta property="og:url" content="([^"]+)"/)?.replace(/\/$/, ""), `${path} og:url`).toBe(url);
    expect(pick(html, /<meta name="robots" content="([^"]+)"/), path).toBe("index, follow");
    const title = pick(html, /<title>([^<]+)<\/title>/)!;
    expect(title.length, `${path} title "${title}"`).toBeLessThanOrEqual(70);
    expect(titles.has(title), `${path} duplicate title`).toBe(false);
    titles.add(title);
    expect(pick(html, /<meta property="og:title" content="([^"]+)"/), `${path} og:title`).toBe(title.replace(/&amp;/g, "&"));
    const description = pick(html, /<meta name="description" content="([^"]+)"/) ?? "";
    expect(description.length, `${path} description`).toBeGreaterThanOrEqual(70);
    expect(description.length, `${path} description`).toBeLessThanOrEqual(165);
    expect((html.match(/<h1[\s>]/g) ?? []).length, `${path} h1`).toBe(1);
    expect(html.match(/<img(?![^>]*\balt=)[^>]*>/g), `${path} images without alt`).toBeNull();
    expect(html).toContain('<meta property="og:image"');
    jsonLd(html); // throws on invalid JSON-LD
  }
});

test("private pages and APIs are never indexable", async ({ request }) => {
  for (const path of ["/login", "/forgot-password", "/reset-password", "/verify-email", "/dashboard", "/dashboard/share", "/onboarding", "/cli/activate", "/api/health"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.headers()["x-robots-tag"], path).toBe("noindex, nofollow");
  }
  const login = await (await request.get("/login")).text();
  expect(login).toMatch(/<meta name="robots" content="noindex/);
  expect(login).not.toContain('rel="canonical"'); // no canonical pointing elsewhere on noindex pages
});

test("structured data matches the page: software, organization and the visible FAQ", async ({ page, request }) => {
  const home = jsonLd(await (await request.get("/")).text());
  const types = home.map((d) => d["@type"]);
  expect(types).toEqual(expect.arrayContaining(["SoftwareApplication", "Organization", "WebSite", "FAQPage"]));
  const faq = home.find((d) => d["@type"] === "FAQPage") as { mainEntity: { name: string }[] };
  await page.goto("/");
  for (const q of faq.mainEntity) await expect(page.locator("#faq").getByRole("button", { name: q.name })).toHaveCount(1);

  const guide = jsonLd(await (await request.get("/share-nextjs-localhost")).text());
  const crumbs = guide.find((d) => d["@type"] === "BreadcrumbList") as { itemListElement: { name: string; item: string }[] };
  expect(crumbs.itemListElement.map((i) => i.name)).toEqual(["Home", "Guides", "Share a Next.js app"]);
  const guideFaq = guide.find((d) => d["@type"] === "FAQPage") as { mainEntity: { name: string }[] };
  await page.goto("/share-nextjs-localhost");
  for (const q of guideFaq.mainEntity) await expect(page.getByRole("heading", { name: q.name, level: 3 })).toBeVisible();
});

test("guides are linked from the footer and the docs, and render on mobile", async ({ page }) => {
  await page.goto("/docs");
  for (const name of ["Share Localhost", "Next.js Guide", "Vite Guide", "ngrok Alternative"]) await expect(page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name, exact: true })).toBeVisible();
  for (const name of ["Share localhost online", "Share a Next.js app", "Share a Vite app", "ngrok alternative"]) await expect(page.getByRole("navigation", { name: "Guides" }).getByRole("link", { name })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of ["/share-localhost", "/ngrok-alternative", "/share-vite-localhost", "/share-nextjs-localhost", "/docs", "/docs/frameworks", "/docs/cli"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }
});

test("hero text is visible in the first paint, even without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toContainText("Share your localhost.");
  expect(await h1.evaluate((el) => getComputedStyle(el.parentElement!).opacity)).toBe("1");
  // Scroll-revealed sections stay readable too.
  expect(await page.locator(".reveal").first().evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  await context.close();
});
