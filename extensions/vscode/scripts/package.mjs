// Builds the shippable, versioned .vsix and its checksum, then verifies it. Never publishes anything.
//
//   node scripts/package.mjs                  → dist/localians-<version>.vsix + dist/localians-<version>.vsix.sha256
//   node scripts/package.mjs --out-dir <dir>  → same, elsewhere (tests)
//
// vsce rewrites the README's relative image links to absolute ones. The extension lives in a subfolder of the repository,
// so the base URLs say where its files really are (otherwise every screenshot would 404 on the Marketplace).
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const repoRoot = path.resolve(root, "..", "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const outIndex = process.argv.indexOf("--out-dir");
const outDir = path.resolve(outIndex >= 0 ? process.argv[outIndex + 1] : path.join(root, "dist"));
const file = path.join(outDir, `localians-${manifest.version}.vsix`);

const REPO = "https://github.com/THINXIFY/Localians";
const BASE_CONTENT = `${REPO}/blob/main/extensions/vscode`;
const BASE_IMAGES = "https://raw.githubusercontent.com/THINXIFY/Localians/main/extensions/vscode";

fs.mkdirSync(outDir, { recursive: true });
execFileSync(process.execPath, [path.join(here, "build.mjs"), "--production"], { cwd: root, stdio: "inherit" });

const vsce = path.join(root, "node_modules", "@vscode", "vsce", "vsce");
fs.rmSync(file, { force: true });
execFileSync(process.execPath, [vsce, "package", "--no-dependencies", "--baseContentUrl", BASE_CONTENT, "--baseImagesUrl", BASE_IMAGES, "--out", file], { cwd: root, stdio: "inherit" });

const sha256 = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
fs.writeFileSync(`${file}.sha256`, `${sha256}  ${path.basename(file)}\n`);

execFileSync(process.execPath, [path.join(repoRoot, "scripts", "verify-vsix.mjs"), file], { cwd: repoRoot, stdio: "inherit" });
console.log(`${path.relative(repoRoot, file)}\nsha256 ${sha256}`);
