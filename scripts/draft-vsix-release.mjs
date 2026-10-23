// Creates a DRAFT GitHub Release `vscode-v<version>` holding the release candidate .vsix and its checksum. A draft is
// visible only to people with write access; this script can never publish it (publishing is a click in GitHub's UI,
// or an explicit decision by the owner), and it refuses to touch a release or tag that already exists.
//
//   GITHUB_TOKEN=<token> node scripts/draft-vsix-release.mjs [path/to/localians-<version>.vsix]
//
// The token needs write access to this repository's contents (a fine-grained token with "Contents: Read and write" on
// THINXIFY/Localians). It is read from the environment only: never put it in a file, a command-line argument or the repo.
// The checksum of the file must equal the one in src/lib/vscode-extension.ts, i.e. the one the website shows.
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = (process.env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/+$/, "");
const REPO = process.env.GITHUB_REPOSITORY ?? "THINXIFY/Localians";
const token = process.env.GITHUB_TOKEN;

const config = fs.readFileSync(process.env.VSCODE_EXTENSION_CONFIG ?? path.join(root, "src", "lib", "vscode-extension.ts"), "utf8");
const pick = (re) => re.exec(config)?.[1];
const version = pick(/vsix: \{\s*version: "([^"]+)"/);
const expectedSha = pick(/sha256: "([0-9a-f]{64})"/);
const fileArg = process.argv[2] ?? path.join(root, "extensions", "vscode", "dist", `localians-${version}.vsix`);

function fail(message) {
  console.error(`Not creating the release: ${message}`);
  process.exit(1);
}

if (!token) fail("GITHUB_TOKEN is not set (see the header of this script).");
if (!version || !expectedSha) fail("couldn't read the version and checksum from src/lib/vscode-extension.ts.");
if (!fs.existsSync(fileArg)) fail(`${fileArg} doesn't exist. Build it with \`npm run vscode:package\` (the checksum on the website is for the candidate built on 2026-10-24; a new build has a different one).`);

const bytes = fs.readFileSync(fileArg);
const sha = crypto.createHash("sha256").update(bytes).digest("hex");
if (sha !== expectedSha) fail(`the file's SHA-256 is ${sha} but the website says ${expectedSha}. Release the file the website describes, or update src/lib/vscode-extension.ts first.`);
if (path.basename(fileArg) !== `localians-${version}.vsix`) fail(`the file must be named localians-${version}.vsix.`);
const verified = spawnSync(process.execPath, [path.join(root, "scripts", "verify-vsix.mjs"), fileArg], { encoding: "utf8" });
if (verified.status !== 0) fail(`the package check failed:\n${verified.stderr}`);

const tag = `vscode-v${version}`;
const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "localians-release-script" };
async function gh(method, url, body, extra = {}) {
  const response = await fetch(url.startsWith("http") ? url : `${API}${url}`, { method, headers: { ...headers, ...extra }, body });
  return { status: response.status, json: await response.json().catch(() => ({})) };
}

// Never replace anything: the tag and any release of it must not exist yet.
for (const [what, url] of [["a release", `/repos/${REPO}/releases/tags/${tag}`], ["a tag", `/repos/${REPO}/git/ref/tags/${tag}`]]) {
  const found = await gh("GET", url);
  if (found.status === 200) fail(`${what} named ${tag} already exists. Files are never replaced: publish a new version instead.`);
  if (found.status !== 404) fail(`couldn't check for ${what} named ${tag} (HTTP ${found.status}). Check the token's access.`);
}

const notes = `**Localians for VS Code ${version}** (publisher THINXIFY, \`thinxify.localians\`), for VS Code 1.90 or newer.

**Install from the file**
1. Download \`localians-${version}.vsix\`.
2. Check it: its SHA-256 must be \`${sha}\` (also in \`localians-${version}.vsix.sha256\`).
3. In VS Code open Extensions, click the \`…\` menu at the top right, choose **Install from VSIX…** and select the file.

Extensions installed from a .vsix don't receive automatic Marketplace updates by default: install a newer .vsix to update.
Guide: https://localians.com/docs/vscode`;

const created = await gh("POST", `/repos/${REPO}/releases`, JSON.stringify({ tag_name: tag, target_commitish: "main", name: `Localians for VS Code ${version}`, body: notes, draft: true, prerelease: false }), { "content-type": "application/json" });
if (created.status !== 201 || created.json.draft !== true) fail(`GitHub didn't create a draft (HTTP ${created.status}).`);
const uploadBase = String(created.json.upload_url ?? "").replace(/\{.*$/, "");
for (const [name, data, type] of [
  [`localians-${version}.vsix`, bytes, "application/vsix"],
  [`localians-${version}.vsix.sha256`, Buffer.from(`${sha}  localians-${version}.vsix\n`), "text/plain"],
]) {
  const up = await gh("POST", `${uploadBase}?name=${encodeURIComponent(name)}`, data, { "content-type": type });
  if (up.status !== 201) fail(`uploading ${name} failed (HTTP ${up.status}). The draft release exists; delete it in GitHub and retry.`);
}
console.log(`Draft release ${tag} created with the .vsix and its checksum: ${created.json.html_url}\nIt is NOT public. Review it, publish it in GitHub when approved, then run: npm run vscode:verify-release`);
