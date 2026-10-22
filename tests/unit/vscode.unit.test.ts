import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  COMMON_PORTS,
  detectWorkspaceApps,
  findRunningApps,
  frameworkFromResponse,
  frameworkValueFor,
  MAX_PORTS,
  portsToCheck,
  probe,
  suggestProjectName,
} from "../../extensions/vscode/src/core/detect";
import { DEFAULT_SERVER_URL, isWebUrl, parseServerUrl } from "../../extensions/vscode/src/core/server";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localians vscode unit "));
const servers: { close: () => void }[] = [];
afterAll(() => {
  for (const s of servers) s.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function folder(rel: string, files: Record<string, string>) {
  const dir = path.join(tmp, rel);
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

async function httpServer(handler: http.RequestListener) {
  const server = http.createServer(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return (server.address() as net.AddressInfo).port;
}

describe("server URL setting", () => {
  it("defaults to https://localians.com and only accepts https (http just for localhost)", () => {
    expect(parseServerUrl(undefined)).toEqual({ ok: true, url: DEFAULT_SERVER_URL });
    expect(parseServerUrl("")).toEqual({ ok: true, url: "https://localians.com" });
    expect(parseServerUrl("https://staging.localians.com/")).toEqual({ ok: true, url: "https://staging.localians.com" });
    expect(parseServerUrl("http://localhost:3001")).toEqual({ ok: true, url: "http://localhost:3001" });
    expect(parseServerUrl("http://127.0.0.1:3001/")).toEqual({ ok: true, url: "http://127.0.0.1:3001" });
    for (const bad of ["http://evil.example", "ftp://localians.com", "https://user:pw@localians.com", "https://localians.com/?x=1", "not a url", "file:///etc/passwd"]) {
      expect(parseServerUrl(bad).ok, bad).toBe(false);
    }
  });

  it("only opens/copies http(s) links", () => {
    expect(isWebUrl("https://abc.preview.localians.com")).toBe(true);
    for (const bad of ["javascript:alert(1)", "file:///C:/x", "command:workbench.action.terminal.new", "https://a:b@x.com", null, 42]) expect(isWebUrl(bad)).toBe(false);
  });
});

describe("workspace app detection (manifests only, nothing executed)", () => {
  it("recognises common frameworks and their usual ports, including a monorepo", () => {
    const repo = folder("Mono Repo", {
      "package.json": JSON.stringify({ name: "mono", private: true }),
      "apps/web/package.json": JSON.stringify({ name: "@acme/web", dependencies: { next: "16", react: "19" } }),
      "apps/admin/package.json": JSON.stringify({ name: "admin", devDependencies: { vite: "8", vue: "3" } }),
      "apps/dash/package.json": JSON.stringify({ name: "dash", dependencies: { "@angular/core": "20" } }),
      "packages/ui/package.json": JSON.stringify({ name: "ui", dependencies: { react: "19" } }),
      "services/api/package.json": JSON.stringify({ name: "api", dependencies: { express: "5" } }),
      "backend/manage.py": "",
      "backend/requirements.txt": "Django==5.2",
      "flaskapp/requirements.txt": "flask==3",
      "flaskapp/package.json": "{}",
      "node_modules/next/package.json": JSON.stringify({ name: "next" }),
    });
    const apps = detectWorkspaceApps([repo]);
    const by = (name: string) => apps.find((a) => a.name === name);
    expect(by("web")).toMatchObject({ framework: "Next.js", frameworkValue: "NEXTJS", port: 3000 });
    expect(by("admin")).toMatchObject({ framework: "Vue", port: 5173 });
    expect(by("dash")).toMatchObject({ framework: "Angular", port: 4200 });
    expect(by("api")).toMatchObject({ framework: "Express", port: 3000 });
    expect(apps.find((a) => a.framework === "Django")).toMatchObject({ port: 8000 });
    expect(apps.some((a) => a.folder.includes("node_modules"))).toBe(false);
    expect(apps.some((a) => a.name === "ui")).toBe(false); // a component library: no dev server port
  });

  it("handles Python, Ruby and folders with spaces (Windows-style paths)", () => {
    expect(detectWorkspaceApps([folder("py app", { "pyproject.toml": '[project]\nname = "fastapi-svc"\ndependencies = ["fastapi"]\n' })])[0]).toMatchObject({
      name: "fastapi-svc",
      framework: "FastAPI",
      port: 8000,
    });
    expect(detectWorkspaceApps([folder("flask one", { "requirements.txt": "Flask==3.0\n" })])[0]).toMatchObject({ framework: "Flask", port: 5000 });
    expect(detectWorkspaceApps([folder("My Rails Site", { Gemfile: "gem 'rails'\n" })])[0]).toMatchObject({ name: "My Rails Site", framework: "Rails", port: 3000 });
    expect(detectWorkspaceApps([path.join(tmp, "does not exist")])).toEqual([]);
    const win = "C:\\Users\\Dev\\My Project";
    expect(path.win32.basename(win)).toBe("My Project"); // names come from path.basename, which handles both separators per platform
  });

  it("checks a short, bounded list of ports: workspace hints, extra ports, then common ones", () => {
    const ports = portsToCheck([{ name: "x", framework: "Astro", frameworkValue: "OTHER", port: 4321, folder: "/x" }], [9999, 0, 70000, "3000", 3000]);
    expect(ports[0]).toBe(4321);
    expect(ports).toContain(9999);
    expect(ports).not.toContain(0);
    expect(ports).not.toContain(70000);
    expect(new Set(ports).size).toBe(ports.length);
    for (const p of COMMON_PORTS) expect(ports).toContain(p);
    expect(portsToCheck([], Array.from({ length: 100 }, (_, i) => 10000 + i)).length).toBe(MAX_PORTS);
  });
});

describe("running app detection (loopback only)", () => {
  it("finds HTTP servers, guesses the framework, and ignores ports that aren't HTTP", async () => {
    const next = await httpServer((_req, res) => res.writeHead(200, { "x-powered-by": "Next.js", "content-type": "text/html" }).end("<title>Shop</title><script src=/_next/x.js></script>"));
    const vite = await httpServer((_req, res) => res.end('<script type="module" src="/@vite/client"></script>'));
    const raw = net.createServer((s) => {
      s.on("error", () => undefined);
      s.end("SSH-2.0-not-http\r\n");
    });
    await new Promise<void>((r) => raw.listen(0, "127.0.0.1", r));
    servers.push(raw);
    const rawPort = (raw.address() as net.AddressInfo).port;

    expect(await probe(next)).toEqual({ port: next, address: "127.0.0.1", framework: "Next.js", title: "Shop" });
    expect((await probe(vite))?.framework).toBe("Vite");
    expect(await probe(rawPort)).toBeNull();
    expect(await probe(1)).toBeNull();

    const repo = folder("matching", { "package.json": JSON.stringify({ name: "storefront", dependencies: { next: "16" } }) });
    const workspace = detectWorkspaceApps([repo]).map((a) => ({ ...a, port: next }));
    const found = await findRunningApps(workspace, [vite, next, rawPort, 1]);
    expect(found.map((a) => a.port)).toEqual([next, vite]); // workspace match first
    expect(found[0]).toMatchObject({ name: "storefront", framework: "Next.js", frameworkValue: "NEXTJS" });
    expect(found[1]).toMatchObject({ name: null, framework: "Vite" });
  });

  it("never labels another project's server with this workspace's name when it's ambiguous", async () => {
    const page = (title: string) => (_req: http.IncomingMessage, res: http.ServerResponse) =>
      res.writeHead(200, { "x-powered-by": "Next.js" }).end(`<title>${title}</title>`);
    const mine = await httpServer(page("Sample Store"));
    const someoneElses = await httpServer(page("Other App")); // e.g. a different Next.js project on 3000
    const repo = folder("ambiguous", { "package.json": JSON.stringify({ name: "next-sample-app", dependencies: { next: "16" } }) });
    const workspace = detectWorkspaceApps([repo]);
    const found = await findRunningApps(workspace, [someoneElses, mine]);
    expect(found.every((a) => a.name === null)).toBe(true);
    expect(found.map((a) => a.title).sort()).toEqual(["Other App", "Sample Store"]);
    // …but a new project is still named after this workspace's app.
    expect(suggestProjectName(found[0], workspace, "folder")).toBe("next-sample-app");
    expect(frameworkValueFor("Next.js")).toBe("NEXTJS");
    expect(frameworkValueFor("Flask")).toBe("OTHER");
    expect(frameworkValueFor(null)).toBeNull();
  });

  it("recognises frameworks from response details", () => {
    expect(frameworkFromResponse({ server: "Werkzeug/3.0" }, "")).toBe("Flask");
    expect(frameworkFromResponse({ server: "WSGIServer/0.2 CPython/3.12" }, "")).toBe("Django");
    expect(frameworkFromResponse({ "x-powered-by": "Express" }, "")).toBe("Express");
    expect(frameworkFromResponse({ server: "uvicorn" }, "")).toBe("FastAPI");
    expect(frameworkFromResponse({}, '<app-root ng-version="20.0.0">')).toBe("Angular");
    expect(frameworkFromResponse({}, "<p>hello</p>")).toBeNull();
  });
});
