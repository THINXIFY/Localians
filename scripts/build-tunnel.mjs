// Bundles the CLI and the gateway into single files with no runtime dependencies.
import fs from "node:fs";
import { build } from "esbuild";

// The server the CLI talks to unless told otherwise, so developers can run `localians share 3000`
// with no flags. Set LOCALIANS_DEFAULT_API_URL for a published build (e.g. https://app.localians.com);
// locally it falls back to this checkout's web app (BETTER_AUTH_URL from .env).
if (fs.existsSync(".env")) process.loadEnvFile(".env");
const defaultApiUrl = process.env.LOCALIANS_DEFAULT_API_URL ?? process.env.BETTER_AUTH_URL ?? "";
if (defaultApiUrl && !/^https?:\/\/[^\s"]+$/.test(defaultApiUrl)) throw new Error(`Invalid default API URL: ${defaultApiUrl}`);

const common = { bundle: true, platform: "node", target: "node20", format: "cjs", legalComments: "none", logLevel: "info" };

await build({
  ...common,
  entryPoints: ["tunnel/cli/main.ts"],
  outfile: "tunnel/cli/dist/localians.js",
  banner: { js: "#!/usr/bin/env node" },
  minify: true,
  define: { __LOCALIANS_DEFAULT_API_URL__: JSON.stringify(defaultApiUrl) },
});
console.log(`CLI default server: ${defaultApiUrl || "(none — pass --api-url)"}`);

await build({
  ...common,
  entryPoints: ["tunnel/gateway/main.ts"],
  outfile: "tunnel/gateway/dist/gateway.js",
});
