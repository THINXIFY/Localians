import { execFile, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The release scripts, against mock servers: drafting a GitHub Release (never public, never replacing) and verifying
// the public asset before the website's Download button is enabled.

const root = path.resolve(__dirname, "..", "..");
const extensionRoot = path.join(root, "extensions", "vscode");
const TAG = "vscode-v0.1.0";
let tmp: string;
let vsix: string;
let sha: string;
let configFile: string;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localians-release-test-"));
  execFileSync(process.execPath, [path.join(extensionRoot, "scripts", "package.mjs"), "--out-dir", tmp], { cwd: extensionRoot, stdio: "pipe" });
  vsix = path.join(tmp, "localians-0.1.0.vsix");
  sha = crypto.createHash("sha256").update(fs.readFileSync(vsix)).digest("hex");
  // The real config, with this build's checksum (the real one pins the actual release candidate).
  configFile = path.join(tmp, "vscode-extension.ts");
  fs.writeFileSync(configFile, fs.readFileSync(path.join(root, "src", "lib", "vscode-extension.ts"), "utf8").replace(/sha256: "[0-9a-f]{64}"/, `sha256: "${sha}"`));
}, 120_000);
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function run(script: string, args: string[], env: Record<string, string>) {
  return new Promise<{ code: number; out: string; err: string }>((resolve) => {
    execFile(process.execPath, [path.join(root, "scripts", script), ...args], { env: { ...process.env, VSCODE_EXTENSION_CONFIG: configFile, ...env }, encoding: "utf8" }, (error, out, err) =>
      resolve({ code: error ? ((error as { code?: number }).code ?? 1) : 0, out, err }),
    );
  });
}

async function serve(handler: http.RequestListener) {
  const server = http.createServer(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise((r) => server.close(r)) };
}

describe("draft-vsix-release", () => {
  /** A tiny GitHub: records every request; releases/tags exist only when told to. */
  async function github(existing: "none" | "release" | "tag" = "none") {
    const calls: { method: string; url: string; auth: string | undefined; body: Buffer }[] = [];
    const server = await serve(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      calls.push({ method: req.method ?? "", url: req.url ?? "", auth: req.headers.authorization, body: Buffer.concat(chunks) });
      const send = (status: number, body: object = {}) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
      if (req.method === "GET" && req.url === `/repos/THINXIFY/Localians/releases/tags/${TAG}`) return send(existing === "release" ? 200 : 404);
      if (req.method === "GET" && req.url === `/repos/THINXIFY/Localians/git/ref/tags/${TAG}`) return send(existing === "tag" ? 200 : 404);
      if (req.method === "POST" && req.url === "/repos/THINXIFY/Localians/releases") return send(201, { draft: true, html_url: "https://example.test/release", upload_url: `${server.url}/upload{?name,label}` });
      if (req.method === "POST" && req.url?.startsWith("/upload?name=")) return send(201);
      send(500);
    });
    return { ...server, calls };
  }

  it("creates a DRAFT release with the .vsix and its checksum, using only the token it was given, and never publishes", async () => {
    const gh = await github();
    const result = await run("draft-vsix-release.mjs", [vsix], { GITHUB_TOKEN: "test-token-123", GITHUB_API_URL: gh.url });
    await gh.close();
    expect(result.code, result.err).toBe(0);
    expect(result.out).toContain("NOT public");
    expect(result.out + result.err).not.toContain("test-token-123");
    const create = gh.calls.find((c) => c.method === "POST" && c.url.endsWith("/releases"))!;
    expect(JSON.parse(create.body.toString())).toMatchObject({ tag_name: TAG, draft: true, prerelease: false, name: "Localians for VS Code 0.1.0" });
    expect(JSON.parse(create.body.toString()).body).toContain(sha);
    const uploads = gh.calls.filter((c) => c.url.startsWith("/upload"));
    expect(uploads.map((u) => decodeURIComponent(u.url.split("name=")[1]))).toEqual(["localians-0.1.0.vsix", "localians-0.1.0.vsix.sha256"]);
    expect(uploads[0].body.equals(fs.readFileSync(vsix))).toBe(true);
    expect(uploads[1].body.toString()).toBe(`${sha}  localians-0.1.0.vsix\n`);
    // Only reads, one draft creation and two uploads: no PATCH/PUT/DELETE, so nothing can be published or replaced.
    expect(gh.calls.every((c) => ["GET", "POST"].includes(c.method))).toBe(true);
    expect(gh.calls.every((c) => c.url.startsWith("/upload") || c.auth === "Bearer test-token-123")).toBe(true);
  }, 60_000);

  it("refuses without a token, when a release or tag exists, or when the file isn't the one the website describes", async () => {
    expect((await run("draft-vsix-release.mjs", [vsix], { GITHUB_TOKEN: "" })).err).toContain("GITHUB_TOKEN is not set");

    for (const existing of ["release", "tag"] as const) {
      const gh = await github(existing);
      const result = await run("draft-vsix-release.mjs", [vsix], { GITHUB_TOKEN: "t", GITHUB_API_URL: gh.url });
      await gh.close();
      expect(result.code).toBe(1);
      expect(result.err).toContain("already exists");
      expect(gh.calls.some((c) => c.method === "POST")).toBe(false); // nothing created or uploaded
    }

    const other = path.join(tmp, "other");
    fs.mkdirSync(other, { recursive: true });
    const tampered = path.join(other, "localians-0.1.0.vsix");
    fs.writeFileSync(tampered, Buffer.concat([fs.readFileSync(vsix), Buffer.from("x")]));
    const gh = await github();
    const wrong = await run("draft-vsix-release.mjs", [tampered], { GITHUB_TOKEN: "t", GITHUB_API_URL: gh.url });
    await gh.close();
    expect(wrong.code).toBe(1);
    expect(wrong.err).toContain("the website says");
    expect(gh.calls).toEqual([]);
  }, 60_000);
});

describe("verify-vsix-release", () => {
  const assetPath = `/THINXIFY/Localians/releases/download/${TAG}/localians-0.1.0.vsix`;
  async function host(files: Record<string, Buffer | number>) {
    return serve((req, res) => {
      const entry = files[req.url ?? ""];
      if (typeof entry === "number" || entry === undefined) return res.writeHead(typeof entry === "number" ? entry : 404).end();
      res.writeHead(200).end(entry);
    });
  }

  it("accepts a public asset whose bytes, .sha256 file and package contents all agree", async () => {
    const server = await host({ [assetPath]: fs.readFileSync(vsix), [`${assetPath}.sha256`]: Buffer.from(`${sha}  localians-0.1.0.vsix\n`) });
    const result = await run("verify-vsix-release.mjs", ["--url", `${server.url}${assetPath}`], {});
    await server.close();
    expect(result.code, result.err).toBe(0);
    expect(result.out).toContain("Release asset OK");
  }, 60_000);

  it("refuses a draft (404), a different file, or a checksum file that disagrees", async () => {
    const draft = await host({});
    expect((await run("verify-vsix-release.mjs", ["--url", `${draft.url}${assetPath}`], {})).err).toContain("HTTP 404");
    await draft.close();

    const different = await host({ [assetPath]: Buffer.concat([fs.readFileSync(vsix), Buffer.from("x")]), [`${assetPath}.sha256`]: Buffer.from(`${sha}  x\n`) });
    const wrong = await run("verify-vsix-release.mjs", ["--url", `${different.url}${assetPath}`], {});
    await different.close();
    expect(wrong.code).toBe(1);
    expect(wrong.err).toContain("SHA-256");

    const noSidecar = await host({ [assetPath]: fs.readFileSync(vsix), [`${assetPath}.sha256`]: Buffer.from(`${"0".repeat(64)}  localians-0.1.0.vsix\n`) });
    const mismatch = await run("verify-vsix-release.mjs", ["--url", `${noSidecar.url}${assetPath}`], {});
    await noSidecar.close();
    expect(mismatch.err).toContain(".sha256");
  }, 60_000);
});
