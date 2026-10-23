import { expect, test } from "@playwright/test";
import { createUserOnDashboard, expectNoHorizontalOverflow } from "./helpers";
import { vscodeAvailability, vscodeExtension } from "@/lib/vscode-extension";

// The VS Code extension page, its docs, and every place that points to them. While the extension is unreleased
// (src/lib/vscode-extension.ts), nothing may link to an install or a download.

const { installable, downloadable } = vscodeAvailability();

test("extension page: hero, capabilities, steps, and only real buttons are enabled", async ({ page }) => {
  await page.goto("/vscode-extension");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Share Localhost. Right From VS Code.");
  await expect(page.getByText("Turn your running development server into a shareable HTTPS preview link without leaving your editor.")).toBeVisible();
  for (const h of ["Share local ports", "Secure HTTPS links", "Your Localians account", "Copy and manage links", "Project detection", "Access and timing"]) {
    await expect(page.getByRole("heading", { level: 3, name: h })).toBeVisible();
  }
  for (const step of ["Install the extension", "Connect your account", "Share your app"]) await expect(page.getByRole("heading", { level: 3, name: step })).toBeVisible();

  const actions = page.getByTestId("vscode-actions");
  await expect(actions.getByRole("link", { name: "View Documentation" })).toHaveAttribute("href", "/docs/vscode");
  if (installable) {
    await expect(actions.getByRole("link", { name: "Install in VS Code" })).toHaveAttribute("href", vscodeExtension.marketplace.installUri);
  } else {
    // Unreleased: a disabled button, never a link to a listing that doesn't exist.
    await expect(page.getByTestId("install-disabled")).toBeDisabled();
    await expect(page.getByTestId("vscode-status")).toContainText("Coming soon");
    await expect(page.locator('a[href^="vscode:"], a[href*="marketplace.visualstudio.com"]')).toHaveCount(0);
  }
  if (downloadable) {
    await expect(actions.getByRole("link", { name: "Download VSIX" })).toHaveAttribute("href", vscodeExtension.vsix!.url);
  } else {
    await expect(page.getByTestId("vsix-disabled")).toBeDisabled();
    await expect(page.locator('a[href$=".vsix"]')).toHaveCount(0);
    await expect(page.locator("main")).toContainText("Nothing to download yet");
  }
});

test("extension page: SEO, structured data and sitemap", async ({ page, request }) => {
  await page.goto("/vscode-extension");
  await expect(page).toHaveTitle("Localians for VS Code: Share Localhost from Your Editor");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/vscode-extension$/);
  expect(await page.locator('meta[name="robots"]').getAttribute("content")).toBe("index, follow");
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  const types = ld.flatMap((t) => (JSON.parse(t) as { "@type": string } | { "@type": string }[])).flat().map((o) => (o as { "@type": string })["@type"]);
  expect(types).toContain("BreadcrumbList");
  // It is only described as an available application once it is.
  expect(types.includes("SoftwareApplication")).toBe(installable);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/vscode-extension</loc>");
  expect(sitemap).toContain("/docs/vscode</loc>");
});

test("docs page, docs index, footer, homepage and dashboard all lead to the extension", async ({ page }) => {
  await page.goto("/docs/vscode");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Share localhost from VS Code");
  for (const h of ["Install", "Connect", "Share an app", "Password protection", "Commands", "Settings", "Troubleshooting"]) await expect(page.getByRole("heading", { level: 2, name: h })).toBeVisible();
  if (!installable && !downloadable) await expect(page.locator("main")).toContainText("Coming soon");

  await page.goto("/docs");
  await expect(page.getByRole("link", { name: /VS Code Extension/ }).first()).toHaveAttribute("href", "/docs/vscode");
  await expect(page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "VS Code Extension" })).toHaveAttribute("href", "/vscode-extension");

  await page.goto("/");
  const band = page.locator('section[aria-labelledby="vscode-band-title"]');
  await expect(band.getByRole("link", { name: installable ? "Get the extension" : "Learn more" })).toHaveAttribute("href", "/vscode-extension");
  if (!installable && !downloadable) await expect(band).toContainText("Coming soon");

  await createUserOnDashboard(page, "Editor Person");
  await page.goto("/dashboard/share");
  await page.getByText("Help & advanced").click();
  await expect(page.getByRole("link", { name: "The Localians VS Code extension" })).toHaveAttribute("href", "/vscode-extension");
});

test("extension page and docs fit at phone, tablet and desktop widths", async ({ page }) => {
  for (const width of [360, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/vscode-extension", "/docs/vscode"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  }
});
