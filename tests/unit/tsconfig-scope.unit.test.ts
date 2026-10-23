import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

/**
 * The production build type-checks with the config Next.js is pointed at. It must contain only the web app (plus the
 * shared tunnel protocol), never the VS Code extension, tests or anything needing their dependencies: the VPS doesn't
 * install extensions/vscode/node_modules, so @types/vscode can't resolve there (the 225ddd1 deploy failure).
 */
const root = path.resolve(__dirname, "../..");

function programFiles(configName: string) {
  const parsed = ts.getParsedCommandLineOfConfigFile(path.join(root, configName), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    },
  });
  if (!parsed) throw new Error(`cannot read ${configName}`);
  // Resolves every import (like tsc --listFilesOnly) without type-checking.
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: { ...parsed.options, noEmit: true } });
  return program.getSourceFiles().map((f) => path.relative(root, f.fileName).split(path.sep).join("/"));
}

describe("Next.js TypeScript scope", () => {
  it("next build uses the app-only tsconfig", () => {
    expect(nextConfig.typescript?.tsconfigPath).toBe("tsconfig.app.json");
    expect(nextConfig.typescript?.ignoreBuildErrors).toBeFalsy();
    const config = JSON.parse(fs.readFileSync(path.join(root, "tsconfig.app.json"), "utf8")) as { compilerOptions?: Record<string, unknown> };
    expect(config.compilerOptions?.strict).not.toBe(false); // inherits strict from tsconfig.json
  });

  it("never pulls in the VS Code extension, tests, the CLI or the gateway", { timeout: 60_000 }, () => {
    const files = programFiles("tsconfig.app.json");
    const own = files.filter((f) => !f.startsWith("node_modules/") && !f.includes("/node_modules/"));
    expect(own.some((f) => f.startsWith("src/app/"))).toBe(true);
    const leaked = files.filter((f) => /^(extensions|tests|tunnel\/(cli|gateway))\//.test(f) || f.includes("@types/vscode"));
    expect(leaked).toEqual([]);
    expect(own.every((f) => /^(src\/|tunnel\/shared\/|\.next\/|next-env\.d\.ts$)/.test(f)), own.join("\n")).toBe(true);
  });
});
