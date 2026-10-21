// Checks that the CLI bundle is fit to publish as the `localians` npm package. Runs automatically before `npm pack` /
// `npm publish` (tunnel/cli "prepack"), and from the tests.
//
//   node scripts/verify-cli-package.mjs [path/to/localians.js]
//
// Refuses a development build: the published CLI must talk to https://localians.com with no flags.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = path.resolve(process.argv[2] ?? path.join(root, "tunnel/cli/dist/localians.js"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "tunnel/cli/package.json"), "utf8"));
const PRODUCTION_API_URL = "https://localians.com";
const MAX_BYTES = 400 * 1024;

const problems = [];
const check = (ok, message) => ok || problems.push(message);

check(fs.existsSync(bundle), `missing ${path.relative(root, bundle)} — run \`npm run cli:release\` first`);
if (!problems.length) {
  const code = fs.readFileSync(bundle, "utf8");
  check(code.startsWith("#!/usr/bin/env node\n"), "the bundle must start with a `#!/usr/bin/env node` line");
  check(code.includes(JSON.stringify(PRODUCTION_API_URL)), `the default server must be ${PRODUCTION_API_URL} (build with \`npm run cli:release\`)`);
  check(!/(localhost|127\.0\.0\.1):3001|preview\.localhost/.test(code), "a development server address is baked in — rebuild with `npm run cli:release`");
  check(!/\bre_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|ghp_[A-Za-z0-9]{30,}/.test(code), "something that looks like a secret is in the bundle");
  check(Buffer.byteLength(code) <= MAX_BYTES, `the bundle is ${Math.round(Buffer.byteLength(code) / 1024)} KB (limit ${MAX_BYTES / 1024} KB)`);
  check(pkg.bin?.localians === "dist/localians.js", 'package.json "bin" must map localians to dist/localians.js');
  check(/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(pkg.version), `invalid version "${pkg.version}"`);

  const run = (...args) => spawnSync(process.execPath, [bundle, ...args], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1", LOCALIANS_API_URL: "" } });
  const version = run("--version");
  check(version.status === 0 && version.stdout.trim() === pkg.version, `\`localians --version\` printed "${version.stdout.trim()}", expected ${pkg.version}`);
  const help = run("--help");
  check(help.status === 0 && help.stdout.includes("npx localians share 3000"), "`localians --help` failed or lacks the quick-start example");
}

if (problems.length) {
  console.error(`CLI package check failed (${path.relative(root, bundle)}):\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`CLI package OK: localians@${pkg.version}, default server ${PRODUCTION_API_URL}, ${Math.round(fs.statSync(bundle).size / 1024)} KB`);
