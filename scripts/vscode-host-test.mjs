// Runs the extension inside a real VS Code (a downloaded stable build kept in ~/.cache/localians-vscode-test), against a real
// control plane and gateway. Opt-in: `npm test` skips it because it opens VS Code windows and needs a download.
//
//   npm run vscode:test                   latest stable VS Code
//   npm run vscode:test -- 1.90.2         a specific version (the extension supports 1.90 and newer)
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, LOCALIANS_VSCODE_DOWNLOAD: "1" };
if (process.argv[2]) env.LOCALIANS_VSCODE_VERSION = process.argv[2];
// This may itself run inside VS Code (integrated terminal): never inherit its Electron/IPC settings.
for (const key of Object.keys(env)) if (key === "ELECTRON_RUN_AS_NODE" || key.startsWith("VSCODE_")) delete env[key];
const result = spawnSync(process.execPath, [path.join(root, "node_modules", "vitest", "vitest.mjs"), "run", "tests/integration/vscode-host.test.ts"], { cwd: root, env, stdio: "inherit" });
process.exit(result.status ?? 1);
