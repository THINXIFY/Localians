import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { vscodeAvailability, vscodeExtension } from "@/lib/vscode-extension";
import { routes } from "@/lib/site";

const root = path.resolve(__dirname, "..", "..");
const extensionRoot = path.join(root, "extensions", "vscode");
const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8")) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("website ↔ extension consistency (nothing on the site can point at something that doesn't exist)", () => {
  it("the site's extension facts equal the extension's own manifest", () => {
    expect(vscodeExtension.id).toBe(`${manifest.publisher}.${manifest.name}`);
    expect(vscodeExtension.publisherName).toBe("THINXIFY");
    expect(vscodeExtension.displayName).toBe(manifest.displayName);
    expect(vscodeExtension.version).toBe(manifest.version);
    expect(`^${vscodeExtension.minVscode}.0`).toBe(manifest.engines.vscode);
    expect(vscodeExtension.marketplace.listingUrl).toBe(`https://marketplace.visualstudio.com/items?itemName=${vscodeExtension.id}`);
    expect(vscodeExtension.marketplace.installUri).toBe(`vscode:extension/${vscodeExtension.id}`);
    expect(routes.vscodeExtension).toBe("/vscode-extension");
  });

  it("buttons are only enabled for things that are real: Coming soon until a release is recorded", () => {
    const { marketplace, vsix } = vscodeExtension;
    const a = vscodeAvailability();
    expect(a.installable).toBe(marketplace.published);
    expect(a.downloadable).toBe(vsix.released);
    expect(a.comingSoon).toBe(!marketplace.published && !vsix.released);
    // The recorded file: this extension's version, a versioned file on GitHub Releases, and a SHA-256.
    expect(vsix.version).toBe(manifest.version);
    expect(vsix.fileName).toBe(`localians-${manifest.version}.vsix`);
    expect(vsix.url).toBe(`https://github.com/THINXIFY/Localians/releases/download/vscode-v${vsix.version}/${vsix.fileName}`);
    expect(vsix.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(vsix.size).toMatch(/^\d+ KB$/);
  });
});

describe("the VSIX package", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "localians-vsix-"));
  afterAll(() => fs.rmSync(out, { recursive: true, force: true }));

  it("builds a versioned .vsix with a matching checksum, and the verifier accepts exactly that file", () => {
    execFileSync(process.execPath, [path.join(extensionRoot, "scripts", "package.mjs"), "--out-dir", out], { cwd: extensionRoot, stdio: "pipe" });
    const file = path.join(out, `localians-${manifest.version}.vsix`);
    expect(fs.existsSync(file)).toBe(true);
    const sidecar = fs.readFileSync(`${file}.sha256`, "utf8");
    expect(sidecar).toBe(`${crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")}  localians-${manifest.version}.vsix\n`);
    const verified = spawnSync(process.execPath, [path.join(root, "scripts", "verify-vsix.mjs"), file], { encoding: "utf8" });
    expect(verified.status, verified.stderr).toBe(0);
    expect(verified.stdout).toContain(`VSIX OK: ${vscodeExtension.id}@${manifest.version}`);
  }, 120_000);

  it("the verifier refuses a wrong checksum, a renamed file and a missing file", () => {
    const file = path.join(out, `localians-${manifest.version}.vsix`);
    fs.writeFileSync(`${file}.sha256`, `${"0".repeat(64)}  localians-${manifest.version}.vsix\n`);
    expect(spawnSync(process.execPath, [path.join(root, "scripts", "verify-vsix.mjs"), file], { encoding: "utf8" }).stderr).toContain("sha256");
    fs.rmSync(`${file}.sha256`);
    const renamed = path.join(out, "localians.vsix");
    fs.copyFileSync(file, renamed);
    expect(spawnSync(process.execPath, [path.join(root, "scripts", "verify-vsix.mjs"), renamed], { encoding: "utf8" }).stderr).toContain("doesn't match version");
    expect(spawnSync(process.execPath, [path.join(root, "scripts", "verify-vsix.mjs"), path.join(out, "missing.vsix")], { encoding: "utf8" }).status).toBe(1);
  });
});
