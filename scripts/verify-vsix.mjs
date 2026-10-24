// Checks that a Localians VS Code extension package (.vsix) is fit to publish or hand out. Runs from the extension's
// package step and from the tests; it opens the real file, so it checks what users would actually install.
//
//   node scripts/verify-vsix.mjs path/to/localians-0.1.0.vsix
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.resolve(process.argv[2] ?? "");
const yauzl = createRequire(path.join(root, "extensions", "vscode", "package.json"))("yauzl");

const PRODUCTION_API_URL = "https://localians.com";
const MAX_BUNDLE_BYTES = 400 * 1024;
const MAX_VSIX_BYTES = 1024 * 1024;
// Exactly what ships: nothing else may sneak in (source maps, sources, tests, env files, node_modules).
const ALLOWED = new Set([
  "[Content_Types].xml",
  "extension.vsixmanifest",
  "extension/package.json",
  "extension/readme.md",
  "extension/changelog.md",
  "extension/LICENSE.md",
  "extension/dist/extension.js",
  "extension/media/icon.png",
  "extension/media/activity.svg",
  // The sidebar panel (a webview) and the Getting Started walkthrough (0.2.0+).
  "extension/media/panel/panel.js",
  "extension/media/panel/panel.css",
  "extension/media/walkthrough/sign-in.md",
  "extension/media/walkthrough/run-app.md",
  "extension/media/walkthrough/share.md",
  "extension/media/walkthrough/copy-link.md",
]);
// Files a 0.1.x package didn't have yet (verifying an older release must still work).
const SINCE_0_2 = new Set([...ALLOWED].filter((name) => name.includes("/panel/") || name.includes("/walkthrough/")));
const SECRET_PATTERNS = [/-----BEGIN [A-Z ]*PRIVATE KEY/, /\bghp_[A-Za-z0-9]{30,}/, /\bre_[A-Za-z0-9_]{20,}/, /\bAKIA[0-9A-Z]{16}\b/, /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, /\b(?:BETTER_AUTH_SECRET|DATABASE_URL|RESEND_API_KEY|TUNNEL_TOKEN_SECRET|GATEWAY_API_SECRET|VSCE_PAT)\s*[=:]/];

const problems = [];
const check = (ok, message) => ok || problems.push(message);

function readZip(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const entries = new Map();
      zip.on("error", reject);
      zip.on("end", () => resolve(entries));
      zip.on("entry", (entry) => {
        if (entry.fileName.endsWith("/")) return zip.readEntry();
        zip.openReadStream(entry, (err, stream) => {
          if (err) return reject(err);
          const chunks = [];
          stream.on("data", (c) => chunks.push(c));
          stream.on("end", () => {
            entries.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

check(fs.existsSync(file), `missing ${file} — run \`npm run vscode:package\` first`);
if (!problems.length) {
  check(fs.statSync(file).size <= MAX_VSIX_BYTES, `the package is ${Math.round(fs.statSync(file).size / 1024)} KB (limit ${MAX_VSIX_BYTES / 1024} KB)`);
  const entries = await readZip(file);
  const names = [...entries.keys()];
  for (const name of names) check(ALLOWED.has(name), `unexpected file in the package: ${name}`);
  const text = (name) => entries.get(name)?.toString("utf8") ?? "";
  const manifest = JSON.parse(text("extension/package.json") || "{}");
  const legacy = /^0\.1\./.test(manifest.version ?? "");
  for (const name of ALLOWED) if (!(legacy && SINCE_0_2.has(name))) check(entries.has(name), `missing from the package: ${name}`);
  if (!legacy) {
    // The panel builds its page with DOM APIs only, and its HTML shell allows nothing but its own files.
    const panel = text("extension/media/panel/panel.js");
    check(!/\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|\beval\s*\(|new Function\s*\(/.test(panel), "the panel script must not use innerHTML/eval");
  }
  const sidecar = `${file}.sha256`;

  check(manifest.publisher === "thinxify" && manifest.name === "localians", `extension id is ${manifest.publisher}.${manifest.name}, expected thinxify.localians`);
  check(/^\d+\.\d+\.\d+$/.test(manifest.version ?? ""), `invalid version "${manifest.version}"`);
  check(path.basename(file) === `localians-${manifest.version}.vsix`, `file name ${path.basename(file)} doesn't match version ${manifest.version}`);
  check(manifest.engines?.vscode?.startsWith("^1."), "engines.vscode is missing");
  // The extension's license is the owner's decision (currently all rights reserved, see LICENSE.md); it must ship with the package.
  check(manifest.license === "SEE LICENSE IN LICENSE.md" && /^Copyright \(c\) \d{4} /.test(text("extension/LICENSE.md")), "the manifest must point at LICENSE.md and LICENSE.md must carry a copyright line");
  check(manifest.repository?.url?.includes("github.com/THINXIFY/Localians") && manifest.bugs?.url && manifest.homepage, "repository, bugs and homepage links are required");
  check(manifest.icon === "media/icon.png" && entries.get("extension/media/icon.png")?.subarray(1, 4).toString() === "PNG", "the icon must be media/icon.png (a PNG)");
  check(manifest.contributes?.configuration?.properties?.["localians.serverUrl"]?.default === PRODUCTION_API_URL, `the default server must be ${PRODUCTION_API_URL}`);
  check(manifest.main === "./dist/extension.js" && Array.isArray(manifest.activationEvents), "main/activationEvents are wrong");
  check(Object.keys(manifest.dependencies ?? {}).length === 0, "the package must have no runtime dependencies (everything is bundled)");

  const bundle = text("extension/dist/extension.js");
  check(bundle.length > 10_000 && Buffer.byteLength(bundle) <= MAX_BUNDLE_BYTES, `unexpected bundle size ${Math.round(Buffer.byteLength(bundle) / 1024)} KB`);
  check(bundle.includes(JSON.stringify(PRODUCTION_API_URL)), `the bundle doesn't reference ${PRODUCTION_API_URL}`);
  check(!/(localhost|127\.0\.0\.1):3001|preview\.localhost/.test(bundle), "a development server address is baked into the bundle");
  check(!/sourceMappingURL=/.test(bundle), "the bundle references a source map");
  if (!legacy) check(bundle.includes("default-src 'none'") && bundle.includes("script-src 'nonce-"), "the panel's Content Security Policy is missing from the bundle");

  const readme = text("extension/readme.md");
  const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
  check(images.length > 0, "the README has no screenshots");
  for (const url of images) check(/^https:\/\/raw\.githubusercontent\.com\/THINXIFY\/Localians\/main\/extensions\/vscode\/media\/screenshots\/[\w-]+\.png$/.test(url), `README image link is not a valid absolute GitHub URL: ${url}`);
  check(!/localhost:3001|unpublished|isn't published/i.test(readme), "the README has development or outdated wording");

  for (const name of names) {
    if (name.endsWith(".png")) continue;
    const content = text(name);
    for (const pattern of SECRET_PATTERNS) check(!pattern.test(content), `${name} contains something that looks like a secret (${pattern})`);
  }

  if (fs.existsSync(sidecar)) {
    const expected = fs.readFileSync(sidecar, "utf8").split(/\s+/)[0];
    check(expected === crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"), "the .sha256 file doesn't match the package");
  }
  if (!problems.length) console.log(`VSIX OK: ${manifest.publisher}.${manifest.name}@${manifest.version}, ${names.length} files, ${Math.round(fs.statSync(file).size / 1024)} KB`);
}

if (problems.length) {
  console.error(`VSIX check failed (${path.basename(file)}):\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
