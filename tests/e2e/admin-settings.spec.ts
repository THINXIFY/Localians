import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { qrPath } from "@/lib/payment-qr";
import { TEST_DATABASE_URL } from "../setup/test-env";
import { createProject, createUserOnDashboard, expectNoHorizontalOverflow, sql } from "./helpers";

// /admin/settings (payment toggle, wallet, QR), the admin sidebar, workspace avatars and Share App dropdowns.
// Test-only admin credentials, the same as admin.spec.ts (throwaway test database).
const ADMIN_EMAIL = "admin-e2e@example.test";
const ADMIN_PASSWORD = "E2E-Admin-Password-2026";
const DEFAULT_WALLET = "0x2f94b75535eff533378c90f8dda29cf10208b174";
const NEW_WALLET = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";

test.beforeAll(() => {
  const root = path.resolve(__dirname, "..", "..");
  try {
    execFileSync(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), "scripts/create-admin.ts", "--email", ADMIN_EMAIL], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, LOCALIANS_ADMIN_PASSWORD: ADMIN_PASSWORD },
      stdio: "pipe",
    });
  } catch (error) {
    if (!String((error as { stderr?: Buffer }).stderr ?? "").includes("already exists")) throw error;
  }
});

// Every test leaves payments on, with the default wallet and the generated QR.
test.afterEach(async () => {
  await sql(`UPDATE payment_settings SET enabled = true, recipient = $1, "qrImageId" = NULL WHERE id = 1`, [DEFAULT_WALLET]);
});

/** This spec signs the admin in often; clear its sign-in rate-limit counters (test database only) so later specs can too. */
const resetAdminLoginLimits = () => sql(`DELETE FROM rate_limit_windows WHERE key LIKE 'admin-login-%'`);
test.afterAll(resetAdminLoginLimits);

async function adminLogin(page: Page) {
  await resetAdminLoginLimits();
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function qrPng(text: string) {
  const qr = qrPath(text);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${qr.size} ${qr.size}" width="${qr.size * 8}" height="${qr.size * 8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${qr.d}" fill="#000"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

test("payment settings are admin-only (page and actions)", async ({ page }) => {
  await page.goto("/admin/settings");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await createUserOnDashboard(page, "Not An Admin");
  await page.goto("/admin/settings");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("turning payments off and on reaches the checkout, the homepage and the Terms without a redeploy", async ({ page }) => {
  // A customer with a project, in a second browser context.
  const customer = await page.context().browser()!.newContext();
  const shop = await customer.newPage();
  await createUserOnDashboard(shop, "Toggle Customer");
  await createProject(shop, { name: "Toggle App", port: "4700" });
  const projectUrl = shop.url();

  await adminLogin(page);
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/admin\/settings$/);
  const settings = page.getByTestId("payment-settings");
  await expect(settings.getByText("Enabled", { exact: true })).toBeVisible();

  // Off: no confirmation needed.
  await page.getByRole("switch", { name: "Accept payments" }).click();
  await settings.getByRole("button", { name: "Save changes" }).first().click();
  await expect(settings.getByText("Disabled", { exact: true })).toBeVisible();
  expect((await sql(`SELECT action FROM audit_logs WHERE action = 'payments.disabled'`)).rows.length).toBeGreaterThan(0);

  await shop.goto(projectUrl);
  await shop.locator("#plan").getByRole("button", { name: "7-Day Pass · Coming soon" }).click();
  const dialog = shop.getByTestId("upgrade-dialog");
  await expect(dialog.getByTestId("payments-coming-soon")).toBeVisible();
  await expect(dialog).not.toContainText(DEFAULT_WALLET);
  await expect(dialog.getByRole("img", { name: /QR code/ })).toHaveCount(0);
  await shop.goto("/");
  await expect(shop.locator("#pricing").getByTestId("pass-coming-soon")).toHaveText("Coming Soon");
  await shop.goto("/terms");
  await expect(shop.locator("main")).toContainText("can't be purchased yet");

  // On: asks for confirmation, showing the wallet.
  await page.getByRole("switch", { name: "Accept payments" }).click();
  await settings.getByRole("button", { name: "Save changes" }).first().click();
  const confirm = page.getByRole("dialog", { name: "Turn payments on?" });
  await expect(confirm).toContainText(DEFAULT_WALLET);
  await confirm.getByRole("button", { name: "Turn payments on" }).click();
  await expect(settings.getByText("Enabled", { exact: true })).toBeVisible();

  await shop.goto("/");
  await expect(shop.locator("#pricing").getByRole("link", { name: "Upgrade for $5" })).toBeVisible();
  await shop.goto(projectUrl);
  await shop.locator("#plan").getByRole("button", { name: "Upgrade for $5" }).click();
  await expect(shop.getByTestId("upgrade-dialog").getByTestId("wallet-address")).toHaveText(DEFAULT_WALLET);
  await customer.close();
});

test("changing the wallet: checksum validation, old/new confirmation, password re-check; existing orders keep theirs", async ({ page }) => {
  // An order made before the change.
  const customer = await page.context().browser()!.newContext();
  const shop = await customer.newPage();
  await createUserOnDashboard(shop, "Wallet Customer");
  await createProject(shop, { name: "Wallet App", port: "4701" });
  const projectUrl = shop.url();
  await shop.locator("#plan").getByRole("button", { name: "Upgrade for $5" }).click();
  await shop.getByLabel("Your custom URL (optional)").fill(`walletcase${Date.now() % 1_000_000}`);
  await expect(shop.getByTestId("upgrade-dialog").getByTestId("name-status")).toContainText("is available");
  await shop.getByTestId("upgrade-dialog").getByRole("button", { name: "Get my Order ID" }).click();
  await expect(shop.getByTestId("upgrade-dialog").getByTestId("order-id")).toBeVisible();

  await adminLogin(page);
  await page.goto("/admin/settings");
  const input = page.getByTestId("wallet-input");
  await input.fill("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD"); // one character's case is wrong
  await expect(page.getByText("checksum doesn't match")).toBeVisible();
  const walletSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "USDT wallet" }) });
  await expect(walletSection.getByRole("button", { name: "Save changes" })).toBeDisabled();

  await input.fill(NEW_WALLET);
  await walletSection.getByRole("button", { name: "Save changes" }).click();
  const confirm = page.getByRole("dialog", { name: "Change the payment wallet?" });
  await expect(confirm.getByTestId("wallet-old")).toHaveText(DEFAULT_WALLET);
  await expect(confirm.getByTestId("wallet-new")).toHaveText(NEW_WALLET);
  await confirm.getByLabel("Your admin password").fill("wrong-password-123");
  await confirm.getByRole("button", { name: "Change wallet" }).click();
  await expect(confirm).toContainText("password isn't correct");
  await confirm.getByLabel("Your admin password").fill(ADMIN_PASSWORD);
  await confirm.getByRole("button", { name: "Change wallet" }).click();
  await expect(page.getByText("Wallet updated.")).toBeVisible();
  await expect(input).toHaveValue(NEW_WALLET.toLowerCase());

  // The existing order still shows the wallet it was created with.
  await shop.goto(projectUrl);
  await shop.locator("#plan").getByRole("button", { name: "View payment details" }).click();
  await expect(shop.getByTestId("upgrade-dialog").getByTestId("wallet-address")).toHaveText(DEFAULT_WALLET);
  // A new customer sees the new one.
  const other = await customer.newPage();
  await other.context().clearCookies();
  await createUserOnDashboard(other, "New Wallet Customer");
  await createProject(other, { name: "New Wallet App", port: "4702" });
  await other.locator("#plan").getByRole("button", { name: "Upgrade for $5" }).click();
  await expect(other.getByTestId("upgrade-dialog").getByTestId("wallet-address")).toHaveText(NEW_WALLET.toLowerCase());
  await customer.close();
});

test("QR upload: a QR for another wallet is refused; a matching one is saved and served only to signed-in users", async ({ page, request }) => {
  await adminLogin(page);
  await page.goto("/admin/settings");
  const qr = page.locator("section").filter({ has: page.getByRole("heading", { name: "QR code" }) });
  await expect(qr.getByRole("img", { name: `QR code for the wallet address ${DEFAULT_WALLET}` })).toBeVisible(); // generated

  await page.getByTestId("qr-file").setInputFiles({ name: "wrong.png", mimeType: "image/png", buffer: await qrPng(NEW_WALLET.toLowerCase()) });
  await qr.getByRole("button", { name: "Save QR code" }).click();
  await expect(qr).toContainText("not the configured wallet");

  await qr.getByRole("button", { name: "Discard" }).click();
  await page.getByTestId("qr-file").setInputFiles({ name: "right.png", mimeType: "image/png", buffer: await qrPng(DEFAULT_WALLET) });
  await expect(qr.getByRole("img", { name: "Chosen QR image (not saved yet)" })).toBeVisible();
  await qr.getByRole("button", { name: "Save QR code" }).click();
  await expect(qr).toContainText("QR code saved");
  const img = qr.locator(`img[alt="QR code for the wallet address ${DEFAULT_WALLET}"]`);
  await expect(img).toHaveAttribute("src", /^\/api\/media\/payment-qr\/[a-z0-9]+$/);
  await expect(qr.getByText("Uploaded", { exact: true })).toBeVisible();
  const src = await img.getAttribute("src");

  const asAdmin = await page.request.get(src!);
  expect(asAdmin.status()).toBe(200);
  expect(asAdmin.headers()["content-type"]).toBe("image/png");
  expect(asAdmin.headers()["x-content-type-options"]).toBe("nosniff");
  expect((await request.get(src!)).status()).toBe(404); // not signed in
  expect((await page.request.get("/api/media/payment-qr/..%2F..%2Fpackage.json")).status()).toBe(404);

  await qr.getByRole("button", { name: "Use generated QR" }).click();
  await expect(qr).toContainText("generated from the wallet address");
});

test("admin sidebar: the badge keeps clear of the divider, active item is marked, and it fits on phones", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await adminLogin(page);
  const rail = page.getByRole("complementary", { name: "Admin sidebar" });
  const badge = rail.getByText("Admin", { exact: true });
  const [railBox, badgeBox] = [(await rail.boundingBox())!, (await badge.boundingBox())!];
  expect(railBox.x + railBox.width - (badgeBox.x + badgeBox.width)).toBeGreaterThanOrEqual(16);
  await expect(rail.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  await rail.getByRole("link", { name: "Settings" }).click();
  await expect(rail.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
  await expect(rail.getByRole("button", { name: "Logout" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
  for (const link of await page.getByRole("navigation", { name: "Admin" }).getByRole("link").all()) {
    const box = (await link.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390); // all four fit without scrolling
  }
  await expectNoHorizontalOverflow(page);
});

test("workspace avatar: preview, save, shown in the dashboard, members-only image, replace and remove", async ({ page, browser }) => {
  await createUserOnDashboard(page, "Avatar Owner");
  await page.goto("/dashboard/settings/workspace");
  const form = page.getByTestId("workspace-avatar-form");
  await expect(form.getByTestId("workspace-avatar-generated")).toBeVisible();

  const red = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#cc3344" } }).png().toBuffer();
  await page.getByTestId("workspace-avatar-file").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: red });
  await expect(form.getByTestId("workspace-avatar-preview")).toBeVisible();
  await form.getByRole("button", { name: "Save image" }).click();
  await expect(page.getByText("Workspace image updated.")).toBeVisible();

  const shellImage = page.getByRole("banner").getByTestId("workspace-avatar-image");
  await expect(shellImage).toBeVisible();
  const src = (await shellImage.getAttribute("src"))!;
  const own = await page.request.get(src);
  expect(own.status()).toBe(200);
  expect(own.headers()["content-type"]).toBe("image/webp");

  const outsider = await browser.newContext();
  const stranger = await outsider.newPage();
  await createUserOnDashboard(stranger, "Avatar Stranger");
  expect((await stranger.request.get(src)).status()).toBe(404);
  await outsider.close();

  // A non-image is refused with a clear message.
  await page.getByTestId("workspace-avatar-file").setInputFiles({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<svg onload=alert(1)>") });
  await form.getByRole("button", { name: "Save image" }).click();
  await expect(form).toContainText("PNG, JPEG or WebP");
  await form.getByRole("button", { name: "Cancel" }).click();

  await form.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Workspace image removed.")).toBeVisible();
  await expect(page.getByRole("banner").getByTestId("workspace-avatar-generated")).toBeVisible();
  expect((await page.request.get(src)).status()).toBe(404);
});

test("Share App dropdowns keep the chevron clear of the edge and the text, on desktop and phones", async ({ page }) => {
  await createUserOnDashboard(page, "Dropdown User");
  await createProject(page, { name: "Dropdown App", port: "4703" });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard/share");
    for (const select of await page.locator("main select").all()) {
      const style = await select.evaluate((el) => {
        const s = getComputedStyle(el);
        return { appearance: s.appearance, paddingRight: parseFloat(s.paddingRight), bgPos: s.backgroundPositionX, height: el.getBoundingClientRect().height };
      });
      expect(style.appearance).toBe("none");
      expect(style.paddingRight).toBeGreaterThanOrEqual(40);
      expect(style.bgPos).toMatch(/right 16px|calc\(100% - 16px\)/);
      expect(style.height).toBe(40);
    }
    await expectNoHorizontalOverflow(page);
  }
});
