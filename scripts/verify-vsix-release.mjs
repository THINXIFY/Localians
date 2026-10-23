// Verifies the PUBLIC release asset the website would link to, before the Download button is switched on:
// the URL in src/lib/vscode-extension.ts must serve a file whose SHA-256 equals the recorded one, whose .sha256 file
// agrees, and which passes the same package checks as a local build.
//
//   npm run vscode:verify-release            checks the URL recorded in src/lib/vscode-extension.ts
//   node scripts/verify-vsix-release.mjs --url <asset url>   (tests, mirrors)
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = fs.readFileSync(process.env.VSCODE_EXTENSION_CONFIG ?? path.join(root, "src", "lib", "vscode-extension.ts"), "utf8");
const pick = (re) => re.exec(config)?.[1];
const version = pick(/vsix: \{\s*version: "([^"]+)"/);
const fileName = pick(/fileName: "([^"]+)"/);
const expectedSha = pick(/sha256: "([0-9a-f]{64})"/);
const urlIndex = process.argv.indexOf("--url");
const url = urlIndex >= 0 ? process.argv[urlIndex + 1] : pick(/vsix: \{[\s\S]*?url: "([^"]+)"/);

const problems = [];
const check = (ok, message) => ok || problems.push(message);
check(Boolean(version && fileName && expectedSha && url), "couldn't read the release details from src/lib/vscode-extension.ts");

let dir;
if (!problems.length) {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "localians-release-check-"));
  try {
    const asset = await fetch(url, { redirect: "follow" });
    check(asset.status === 200, `${url} answered HTTP ${asset.status} (is the release published, not a draft?)`);
    if (asset.status === 200) {
      const bytes = Buffer.from(await asset.arrayBuffer());
      const sha = crypto.createHash("sha256").update(bytes).digest("hex");
      check(sha === expectedSha, `the published file's SHA-256 is ${sha}, but the website records ${expectedSha}`);
      check(url.endsWith(`/${fileName}`), `the URL must end with /${fileName}`);
      const file = path.join(dir, fileName);
      fs.writeFileSync(file, bytes);
      const verified = spawnSync(process.execPath, [path.join(root, "scripts", "verify-vsix.mjs"), file], { encoding: "utf8" });
      check(verified.status === 0, `the published file fails the package check:\n${verified.stderr}`);
      const sidecar = await fetch(`${url}.sha256`, { redirect: "follow" });
      check(sidecar.status === 200 && (await sidecar.text()).split(/\s+/)[0] === expectedSha, `${url}.sha256 is missing or doesn't match`);
    }
  } catch (error) {
    problems.push(`couldn't download ${url}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (problems.length) {
  console.error(`Release check failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`Release asset OK: ${url}\n  sha256 ${expectedSha} (matches the website, the .sha256 file and the package checks)`);
