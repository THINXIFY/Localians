import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { GATEWAY_PAGE_HEADERS, loginPage } from "@tunnel/gateway/access";
import { LOGO_DATA_URI } from "@tunnel/gateway/brand";
import { errorPage } from "@tunnel/gateway/pages";
import manifest from "@/app/manifest";
import { emailLogoUrl, existingAccountMessage, resetPasswordMessage, verifyEmailMessage } from "@/server/email/templates";

const root = path.resolve(__dirname, "..", "..");
const file = (p: string) => path.join(root, p);
const size = async (p: string) => {
  const m = await sharp(file(p)).metadata();
  return { width: m.width, height: m.height, alpha: m.hasAlpha };
};

describe("brand assets", () => {
  it("keeps the official sources and generates every size at the original proportions", async () => {
    expect(await size("public/images/logo/Localians-logo.png")).toMatchObject({ width: 2000, height: 330, alpha: true });
    expect(await size("public/images/logo/Localians-favicon.png")).toMatchObject({ width: 972, height: 924, alpha: true });
    for (const name of ["localians-logo", "localians-logo-light"]) {
      expect(await size(`public/images/logo/${name}-640.png`)).toMatchObject({ width: 640, height: 106, alpha: true });
      expect(await size(`public/images/logo/${name}-320.png`)).toMatchObject({ width: 320, height: 53, alpha: true });
    }
    expect(await size("public/images/logo/localians-logo-email.png")).toMatchObject({ width: 360, height: 59 });
    expect(await size("public/images/logo/localians-mark-256.png")).toMatchObject({ width: 256, height: 256, alpha: true });
  });

  it("provides square browser icons: icon.png, apple-icon.png and a multi-size favicon.ico", async () => {
    expect(await size("src/app/icon.png")).toMatchObject({ width: 512, height: 512 });
    expect(await size("src/app/apple-icon.png")).toMatchObject({ width: 180, height: 180 });
    const ico = fs.readFileSync(file("src/app/favicon.ico"));
    expect(ico.readUInt16LE(2)).toBe(1); // icon type
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => ico.readUInt8(6 + 16 * i));
    expect(sizes).toEqual([16, 32, 48]);
    expect(fs.existsSync(file("src/app/icon.svg"))).toBe(false); // the old placeholder mark is gone
  });

  it("lists manifest icons that exist, including a maskable one", async () => {
    const m = manifest();
    expect(m.name).toBe("Localians");
    for (const icon of m.icons ?? []) {
      const [w, h] = icon.sizes!.split("x").map(Number);
      expect(await size(`public${icon.src}`)).toMatchObject({ width: w, height: h });
    }
    expect(m.icons?.some((i) => i.purpose === "maskable")).toBe(true);
  });
});

describe("email branding", () => {
  const messages = [
    verifyEmailMessage({ to: "a@example.test", name: "Ada", url: "https://localians.com/verify?token=x" }),
    resetPasswordMessage({ to: "a@example.test", name: "Ada", url: "https://localians.com/reset?token=x" }),
    existingAccountMessage({ to: "a@example.test", name: "Ada", url: "https://localians.com/login" }),
  ];

  it("shows the logo from a public absolute HTTPS URL, with fixed dimensions and alt text", () => {
    expect(emailLogoUrl()).toBe("https://localians.com/images/logo/localians-logo-email.png");
    for (const m of messages) {
      expect(m.html).toContain('<img src="https://localians.com/images/logo/localians-logo-email.png" width="180" height="30" alt="Localians"');
      expect(m.html).not.toMatch(/src="(http:\/\/localhost|\/images)/); // never a local or relative image
    }
  });

  it("carries the tagline and the developer credit in the footer", () => {
    for (const m of messages) {
      expect(m.html).toContain("Your localhost. Anywhere.");
      expect(m.html).toContain('Developed by: <a href="https://thinxify.com"');
    }
  });

  it("can point at another public host (e.g. staging) without code changes", () => {
    process.env.EMAIL_ASSET_BASE_URL = "https://staging.localians.com/";
    try {
      expect(emailLogoUrl()).toBe("https://staging.localians.com/images/logo/localians-logo-email.png");
    } finally {
      delete process.env.EMAIL_ASSET_BASE_URL;
    }
  });
});

describe("gateway page branding", () => {
  it("embeds the wordmark inline (no external requests from preview hosts) and the CSP allows only that", () => {
    expect(LOGO_DATA_URI).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
    for (const html of [errorPage("not-found").html, errorPage("local-unreachable").html, loginPage("/")]) {
      expect(html).toContain(`<img class="brand" src="${LOGO_DATA_URI}" width="144" height="24" alt="Localians">`);
      expect(html).not.toContain("LOCALIANS</p>");
    }
    const csp = GATEWAY_PAGE_HEADERS["content-security-policy"];
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("img-src data:");
    expect(csp).not.toMatch(/img-src[^;]*(https?:|\*)/);
  });
});
