// Bundles the extension into dist/extension.js: one file, no runtime dependencies. It includes the Localians tunnel
// agent and API client from ../../tunnel (the same code as the CLI), so users don't need the CLI installed.
//
//   node scripts/build.mjs               development build (source maps)
//   node scripts/build.mjs --production  minified, no source maps (for the .vsix)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const production = process.argv.includes("--production");
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;

await build({
  entryPoints: [path.join(root, "src/extension.ts")],
  outfile: path.join(root, "dist/extension.js"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  external: ["vscode"],
  alias: { "@tunnel": path.resolve(root, "../../tunnel") },
  define: { __LOCALIANS_EXTENSION_VERSION__: JSON.stringify(version) },
  minify: production,
  sourcemap: production ? false : "linked",
  legalComments: "none",
  logLevel: "info",
});
console.log(`Localians extension ${version} built (${production ? "production" : "development"}).`);
