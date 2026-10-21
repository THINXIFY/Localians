import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { prepareTestDatabase } from "../setup/database";
import { TUNNEL_E2E } from "./env";

export default async function globalSetup() {
  const stop = await prepareTestDatabase();
  if (!fs.existsSync(path.join(TUNNEL_E2E.certs, "gateway.crt"))) {
    execFileSync("node", ["scripts/dev-certs.mjs", TUNNEL_E2E.certs], { cwd: TUNNEL_E2E.root, stdio: "inherit" });
  }
  for (const bundle of ["tunnel/cli/dist/localians.js", "tunnel/gateway/dist/gateway.js"]) {
    if (!fs.existsSync(path.join(TUNNEL_E2E.root, bundle))) throw new Error(`Missing ${bundle}. Run \`npm run tunnel:build\` first.`);
  }
  return async () => {
    await stop?.();
  };
}
