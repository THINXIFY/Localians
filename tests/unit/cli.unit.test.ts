import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HELP } from "@tunnel/cli/args";
import { browserCommand } from "@tunnel/cli/commands";
import { detectProject } from "@tunnel/cli/local";

const root = path.resolve(__dirname, "..", "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localians-cli-unit-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function dir(name: string, files: Record<string, string> = {}) {
  const d = path.join(tmp, name);
  fs.mkdirSync(d, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(d, file)), { recursive: true });
    fs.writeFileSync(path.join(d, file), content);
  }
  return d;
}

describe("project name detection (no more 'localians-web' for everyone)", () => {
  const home = dir("home");

  it("uses package.json, strips npm scopes and detects the framework", () => {
    const d = dir("home/shop", { "package.json": JSON.stringify({ name: "@acme/storefront", dependencies: { next: "16" } }) });
    expect(detectProject(d, home)).toEqual({ name: "storefront", framework: "NEXTJS" });
  });

  it("walks up from a subfolder to the project root", () => {
    const d = dir("home/blog", { "package.json": JSON.stringify({ name: "my-blog", devDependencies: { vite: "8" } }), "src/components/.keep": "" });
    expect(detectProject(path.join(d, "src", "components"), home)).toEqual({ name: "my-blog", framework: "REACT_VITE" });
  });

  it("reads Python, Rust, PHP and Go manifests", () => {
    expect(detectProject(dir("home/py", { "pyproject.toml": '[build-system]\nrequires = []\n\n[project]\nname = "flask-dashboard"\n' }), home).name).toBe("flask-dashboard");
    expect(detectProject(dir("home/poetry", { "pyproject.toml": '[tool.poetry]\nname = "poetry-app"\n' }), home).name).toBe("poetry-app");
    expect(detectProject(dir("home/rs", { "Cargo.toml": '[package]\nname = "rusty-api"\nversion = "0.1.0"\n' }), home).name).toBe("rusty-api");
    expect(detectProject(dir("home/php", { "composer.json": JSON.stringify({ name: "acme/laravel-site" }) }), home).name).toBe("laravel-site");
    expect(detectProject(dir("home/go", { "go.mod": "module github.com/acme/go-service\n\ngo 1.23\n" }), home).name).toBe("go-service");
  });

  it("falls back to the project folder's name, never the home folder or the drive root", () => {
    expect(detectProject(dir("home/Client Portal", { "index.html": "<h1>hi</h1>" }), home)).toEqual({ name: "Client Portal", framework: null });
    expect(detectProject(dir("home/plain-folder"), home)).toEqual({ name: "plain-folder", framework: null });
    expect(detectProject(home, home)).toEqual({ name: "My app", framework: null });
    expect(detectProject(path.parse(tmp).root, home).name).toBe("My app");
  });

  it("survives a broken package.json", () => {
    expect(detectProject(dir("home/broken", { "package.json": "{ not json" }), home)).toEqual({ name: "broken", framework: null });
  });
});

describe("opening the browser for login", () => {
  const url = "https://localians.com/cli/activate?code=ABCD-EFGH&from=cli";

  it("uses the right command on Windows, macOS and Linux, passing the URL as one argument", () => {
    expect(browserCommand(url, "win32")).toEqual(["rundll32.exe", ["url.dll,FileProtocolHandler", url]]); // no `cmd /c start`: `&` stays in the URL
    expect(browserCommand(url, "darwin")).toEqual(["open", [url]]);
    expect(browserCommand(url, "linux")).toEqual(["xdg-open", [url]]);
  });

  it("refuses anything that isn't a plain http(s) URL", () => {
    for (const bad of ["file:///etc/passwd", "javascript:alert(1)", 'https://x.com/" & calc', "https://x.com/a|b", "ms-settings:"]) expect(browserCommand(bad, "win32")).toBeNull();
  });
});

describe("help text", () => {
  it("leads with the one-command quick start and says how to stop", () => {
    expect(HELP).toContain("npx localians share 3000");
    expect(HELP).toContain("Ctrl+C");
  });
});

describe("npm package: release build", () => {
  const outDir = path.join(tmp, "release");
  const bundle = path.join(outDir, "localians.js");
  const build = (env: Record<string, string>, release: boolean) =>
    spawnSync(process.execPath, ["scripts/build-tunnel.mjs", ...(release ? ["--release"] : [])], {
      cwd: root,
      encoding: "utf8",
      // An empty value means "not set" (use the build script default).
      env: Object.fromEntries(Object.entries({ ...process.env, LOCALIANS_CLI_ONLY: "1", ...env }).filter(([, v]) => v !== "")) as NodeJS.ProcessEnv,
    });
  const verify = (file: string) => spawnSync(process.execPath, ["scripts/verify-cli-package.mjs", file], { cwd: root, encoding: "utf8" });
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "tunnel/cli/package.json"), "utf8")) as Record<string, unknown> & { version: string };

  beforeAll(() => {
    const res = build({ LOCALIANS_CLI_OUTFILE: bundle, LOCALIANS_DEFAULT_API_URL: "" }, true);
    expect(res.status, res.stderr).toBe(0);
  }, 60_000);

  it("defaults to https://localians.com, matches the package version and passes the publish check", () => {
    const res = verify(bundle);
    expect(res.stderr).toBe("");
    expect(res.stdout).toContain(`CLI package OK: localians@${pkg.version}, default server https://localians.com`);
    const run = (...args: string[]) => spawnSync(process.execPath, [bundle, ...args], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
    expect(run("--version").stdout.trim()).toBe(pkg.version);
  });

  it("runs without a server flag and gives clear, offline errors (production-compatible settings, no secrets)", () => {
    const config = fs.mkdtempSync(path.join(tmp, "config-"));
    const env = { ...process.env, NO_COLOR: "1", LOCALIANS_CONFIG_DIR: config, LOCALIANS_API_URL: "" };
    const status = spawnSync(process.execPath, [bundle, "status"], { encoding: "utf8", env });
    expect(status.status).toBe(3);
    expect(status.stdout).toContain("Not logged in");
    // Nothing on port 1: stops before any network call, with the beginner-friendly message.
    const share = spawnSync(process.execPath, [bundle, "share", "1"], { encoding: "utf8", env });
    expect(share.status).toBe(4);
    expect(share.stderr).toContain("We couldn't find a website running on port 1. Start your app and try again.");
    const usage = spawnSync(process.execPath, [bundle, "share", "abc"], { encoding: "utf8", env });
    expect(usage.status).toBe(2);
    expect(usage.stderr).toContain('"abc" isn\'t a valid port');
    expect(fs.readdirSync(config)).toEqual([]); // nothing written without a login
  });

  it("refuses to publish a development build", () => {
    const devBundle = path.join(outDir, "dev.js");
    expect(build({ LOCALIANS_CLI_OUTFILE: devBundle, LOCALIANS_DEFAULT_API_URL: "http://localhost:3001" }, false).status).toBe(0);
    const res = verify(devBundle);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("the default server must be https://localians.com");
    // and the release build itself refuses a non-public server
    expect(build({ LOCALIANS_CLI_OUTFILE: devBundle, LOCALIANS_DEFAULT_API_URL: "http://localhost:3001" }, true).status).not.toBe(0);
  }, 60_000);

  it("packs only the bundle, README, LICENSE and package.json (MIT, publishable) and runs the check before packing", () => {
    expect(pkg.bin).toEqual({ localians: "dist/localians.js" });
    expect(pkg.engines).toEqual({ node: ">=20" });
    expect(pkg.os).toEqual(["win32", "darwin", "linux"]);
    expect((pkg.scripts as Record<string, string>).prepack).toBe("node ../../scripts/verify-cli-package.mjs");
    expect(pkg.private).toBeUndefined(); // approved for public npm release (CLI package only)
    expect(pkg.license).toBe("MIT");
    // …and only the CLI: the SaaS app (incl. the gateway) and the VS Code extension stay private, with no repo-wide license.
    expect(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).private).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(root, "extensions/vscode/package.json"), "utf8"))).toMatchObject({ private: true, license: "SEE LICENSE IN LICENSE.md" });
    expect(fs.readdirSync(root).filter((f) => /^licen[cs]e/i.test(f))).toEqual([]);
    const packed = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: path.join(root, "tunnel/cli"), encoding: "utf8", shell: process.platform === "win32" });
    expect(packed.status, packed.stderr).toBe(0);
    const files = (JSON.parse(packed.stdout) as { files: { path: string }[] }[])[0].files.map((f) => f.path).sort();
    expect(files).toEqual(["LICENSE", "README.md", "dist/localians.js", "package.json"]);
  }, 60_000);
});
