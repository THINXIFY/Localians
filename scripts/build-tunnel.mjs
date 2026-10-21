// Bundles the CLI and the gateway into single files with no runtime dependencies.
import fs from "node:fs";
import { build } from "esbuild";

// The server the CLI talks to unless told otherwise, so developers can run `localians share 5173`
// with no flags.
//   npm run tunnel:build   → this checkout's web app (BETTER_AUTH_URL from .env), for local development
//   npm run cli:release    → the production server, https://localians.com (for npm pack / publish)
// LOCALIANS_DEFAULT_API_URL overrides both (e.g. a staging server).
const PRODUCTION_API_URL = "https://localians.com";
const release = process.argv.includes("--release") || process.env.LOCALIANS_CLI_RELEASE === "1";
if (!release && fs.existsSync(".env")) process.loadEnvFile(".env");
const defaultApiUrl = process.env.LOCALIANS_DEFAULT_API_URL ?? (release ? PRODUCTION_API_URL : process.env.BETTER_AUTH_URL ?? "");
// A release build must point at a public https server, never a development one.
if (release && !/^https:\/\/(?!localhost|127\.)[^\s"]+$/.test(defaultApiUrl)) {
  throw new Error("Release builds need a public https server URL (LOCALIANS_DEFAULT_API_URL or the production default).");
}
if (defaultApiUrl && !/^https?:\/\/[^\s"]+$/.test(defaultApiUrl)) throw new Error(`Invalid default API URL: ${defaultApiUrl}`);

const cliVersion = JSON.parse(fs.readFileSync("tunnel/cli/package.json", "utf8")).version;
// LOCALIANS_CLI_OUTFILE lets tests build a release bundle elsewhere without replacing the development one.
const cliOutfile = process.env.LOCALIANS_CLI_OUTFILE ?? "tunnel/cli/dist/localians.js";

const common = { bundle: true, platform: "node", target: "node20", format: "cjs", legalComments: "none", logLevel: "info" };

await build({
  ...common,
  entryPoints: ["tunnel/cli/main.ts"],
  outfile: cliOutfile,
  banner: { js: "#!/usr/bin/env node" },
  minify: true,
  define: { __LOCALIANS_DEFAULT_API_URL__: JSON.stringify(defaultApiUrl), __LOCALIANS_CLI_VERSION__: JSON.stringify(cliVersion) },
});
console.log(`CLI ${cliVersion} default server: ${defaultApiUrl || "(none — pass --api-url)"}`);
if (process.env.LOCALIANS_CLI_ONLY === "1") process.exit(0);

await build({
  ...common,
  entryPoints: ["tunnel/gateway/main.ts"],
  outfile: "tunnel/gateway/dist/gateway.js",
});
