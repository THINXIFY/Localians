import { expect, test } from "@playwright/test";
import { createUserOnDashboard, expectNoHorizontalOverflow } from "./helpers";
import { vscodeAvailability, vscodeExtension } from "@/lib/vscode-extension";

// The VS Code extension page, its docs, and every place that points to them. Only what src/lib/vscode-extension.ts
// says is live may be linked: the site-hosted .vsix, the GitHub mirror once released, the Marketplace once published.

const { installable, downloadable, downloadHref, comingSoon } = vscodeAvailability();

test("extension page: hero, capabilities, steps, and only real buttons are enabled", async ({ page }) => {
  await page.goto("/vscode-extension");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Share Localhost. Right From VS Code.");
  await expect(page.getByText("Turn your running development server into a shareable HTTPS preview link without leaving your editor.")).toBeVisible();
  for (const h of ["Share local ports", "Secure HTTPS links", "Your Localians account", "Copy and manage links", "Project detection", "Access and timing"]) {
    await expect(page.getByRole("heading", { level: 3, name: h })).toBeVisible();
  }
  for (const step of ["Install the extension", "Sign in once", "Share your app"]) await expect(page.getByRole("heading", { level: 3, name: step })).toBeVisible();

  const actions = page.getByTestId("vscode-actions");
  await expect(actions.getByRole("link", { name: "View Documentation" })).toHaveAttribute("href", "/docs/vscode");
  if (installable) {
    await expect(actions.getByRole("link", { name: "Install from Marketplace" })).toHaveAttribute("href", vscodeExtension.marketplace.installUri);
  } else {
    // Unreleased: a disabled button, never a link to a listing that doesn't exist.
    await expect(page.getByTestId("install-disabled")).toBeDisabled();
    await expect(page.getByTestId("vscode-status")).toContainText(comingSoon ? "Coming soon" : "Manual install");
    await expect(page.locator('a[href^="vscode:"], a[href*="marketplace.visualstudio.com"]')).toHaveCount(0);
  }
  if (downloadable) {
    await expect(actions.getByRole("link", { name: "Download VSIX" })).toHaveAttribute("href", downloadHref);
  } else {
    await expect(actions.getByTestId("vsix-disabled")).toBeDisabled();
    await expect(page.locator('a[href$=".vsix"]')).toHaveCount(0);
    await expect(page.locator("main")).toContainText("Nothing to download yet");
  }
});

test("Download VSIX section: version, publisher, supported VS Code, checksum, manual install steps and the updates note", async ({ page }) => {
  await page.goto("/vscode-extension#download");
  await expect(page.getByRole("heading", { level: 2, name: "Download VSIX" })).toBeVisible();
  const card = page.getByTestId("vsix-card");
  const { vsix } = vscodeExtension;
  await expect(card).toContainText(`Localians for VS Code ${vsix.version}`);
  await expect(card).toContainText("THINXIFY (thinxify.localians)");
  await expect(card).toContainText(`VS Code ${vscodeExtension.minVscode} or newer`);
  await expect(card).toContainText(vsix.fileName);
  await expect(page.getByTestId("vsix-sha256")).toHaveText(vsix.sha256);
  await expect(card.getByTestId("vsix-status")).toHaveText(vscodeAvailability().downloadable ? "Available" : "Release pending");
  const download = card.locator('[data-testid="vsix-download"], [data-testid="vsix-disabled"]');
  if (vscodeAvailability().downloadable) await expect(download).toHaveAttribute("href", downloadHref);
  else await expect(download).toBeDisabled();
  // The GitHub mirror appears only once that release is public.
  await expect(card.getByTestId("vsix-github")).toHaveCount(vsix.released ? 1 : 0);

  const steps = page.getByTestId("vsix-steps");
  await expect(steps).toContainText("Install from VSIX…");
  await expect(steps).toContainText("Views and More Actions");
  await expect(steps).toContainText("Get-FileHash");
  await expect(steps).toContainText("shasum -a 256");
  await expect(page.getByTestId("vsix-updates-note")).toContainText("does not receive automatic updates from the");
  await expect(page.getByTestId("marketplace-note")).toContainText(vscodeAvailability().installable ? "Search for Localians" : "Coming soon");
});

test("Download VSIX saves the exact verified file, from this site", async ({ page, request }) => {
  test.skip(!vscodeExtension.vsix.hosted, "the site doesn't host the file");
  await page.goto("/vscode-extension#download");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("vsix-card").getByTestId("vsix-download").click()]);
  expect(download.suggestedFilename()).toBe(vscodeExtension.vsix.fileName);
  const { createHash } = await import("node:crypto");
  const { readFile } = await import("node:fs/promises");
  expect(createHash("sha256").update(await readFile(await download.path())).digest("hex")).toBe(vscodeExtension.vsix.sha256);
  const response = await request.get(downloadHref);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toBe("attachment");
  expect((await request.get(`${downloadHref}.sha256`).then((r) => r.text())).split(/\s+/)[0]).toBe(vscodeExtension.vsix.sha256);
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
  expect(types.includes("SoftwareApplication")).toBe(installable || downloadable);
  if (downloadable && !installable) expect(ld.join("")).toContain(`"downloadUrl":"http`); // absolute, the hosted file
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/vscode-extension</loc>");
  expect(sitemap).toContain("/docs/vscode</loc>");
});

test("docs page, docs index, footer, homepage and dashboard all lead to the extension", async ({ page }) => {
  await page.goto("/docs/vscode");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Share localhost from VS Code");
  for (const h of ["Install", "Connect", "Share an app", "Several apps at once", "Password protection", "Stop sharing and sign out", "Commands", "Settings", "Troubleshooting"]) await expect(page.getByRole("heading", { level: 2, name: h })).toBeVisible();
  await expect(page.getByTestId("vsix-card")).toContainText(vscodeExtension.vsix.sha256);
  await expect(page.getByTestId("vsix-updates-note")).toBeVisible();
  if (!installable && !downloadable) await expect(page.locator("main")).toContainText("Coming soon");

  await page.goto("/docs");
  await expect(page.getByRole("link", { name: /VS Code Extension/ }).first()).toHaveAttribute("href", "/docs/vscode");
  await expect(page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "VS Code Extension" })).toHaveAttribute("href", "/vscode-extension");

  await page.goto("/");
  const band = page.locator('section[aria-labelledby="vscode-band-title"]');
  await expect(band.getByRole("link", { name: installable || downloadable ? "Get the extension" : "Learn more" })).toHaveAttribute("href", "/vscode-extension");
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
