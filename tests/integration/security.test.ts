import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { startAgent } from "@tunnel/cli/agent";
import { createApi } from "@tunnel/cli/api";
import { deriveAccessKey, signAccess } from "@tunnel/gateway/access";
import type { Gateway } from "@tunnel/gateway/gateway";
import { projectInputSchema } from "@/lib/validation/project";
import { signOutVisitors, updateProjectAccess, verifyPreviewAccess } from "@/server/access";
import { decideDeviceAuthorization } from "@/server/cli/device";
import { resetLiveTunnelCache } from "@/server/cli/gateway-control";
import { prisma } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { createProject } from "@/server/projects";
import { rateLimit } from "@/server/rate-limit";
import { createShareSetup, updateShareSetup } from "@/server/share-setup";
import { createVerifiedUser } from "./helpers";
import { GATEWAY_API_SECRET, PREVIEW_DOMAIN, publicRequest, startControlPlane, startLocalApp, startTestGateway, TUNNEL_TOKEN_SECRET, waitFor } from "./tunnel-harness";

const project = (name: string, port = "3000") => projectInputSchema.parse({ name, description: "", framework: "NEXTJS", defaultPort: port });
const COOKIE = "localians.preview_access";

let controlPlane: Awaited<ReturnType<typeof startControlPlane>>;
let gateway: Gateway;
let gatewayPort: number;
let app: Awaited<ReturnType<typeof startLocalApp>>;
const extra: { close(): Promise<void> }[] = [];

beforeAll(async () => {
  Object.assign(process.env, {
    TUNNEL_PREVIEW_DOMAIN: PREVIEW_DOMAIN,
    TUNNEL_TOKEN_SECRET,
    GATEWAY_API_SECRET,
    TUNNEL_PUBLIC_SCHEME: "http",
    CLI_DEVICE_RATE_LIMIT: "1000",
  });
  controlPlane = await startControlPlane();
  const started = await startTestGateway(controlPlane.url);
  gateway = started.gateway;
  gatewayPort = started.port;
  process.env.TUNNEL_GATEWAY_URL = `http://127.0.0.1:${gatewayPort}`;
  process.env.TUNNEL_PUBLIC_PORT = String(gatewayPort);
  process.env.GATEWAY_CONTROL_URL = started.adminUrl;
  app = await startLocalApp();
});

afterAll(async () => {
  for (const e of extra) await e.close();
  await app?.close();
  await gateway?.close();
  await controlPlane?.close();
});

afterEach(() => {
  delete process.env.QUOTA_ACTIVE_PREVIEWS_PER_USER;
  delete process.env.QUOTA_DAILY_BANDWIDTH_MB;
  resetLiveTunnelCache();
});

async function cliLogin(userId: string) {
  const api = createApi(controlPlane.url, null, "test");
  const start = await api.startDeviceLogin("CLI on test-machine (linux)");
  await decideDeviceAuthorization(userId, start.user_code, true);
  return (await api.pollDeviceLogin(start.device_code)).access_token;
}

async function share(token: string, projectId: string, gatewayUrl?: string, onLive: () => boolean = () => true) {
  const api = createApi(controlPlane.url, token, "test");
  const session = await api.createTunnel(projectId, app.port);
  let first: string | null = session.connectToken;
  const agent = startAgent({
    gatewayUrl: gatewayUrl ?? session.gatewayUrl,
    localPort: app.port,
    localAddress: "127.0.0.1",
    getConnectToken: async () => {
      if (first) {
        const t = first;
        first = null;
        return t;
      }
      return api.connectToken(session.sessionId);
    },
  });
  await waitFor(() => agent.state === "connected" && onLive(), 10_000, "tunnel connected");
  if (!gatewayUrl) await waitFor(() => gateway.hasTunnel(session.label), 5000, "gateway registered");
  return { api, session, agent, host: `${session.label}.${PREVIEW_DOMAIN}` };
}

async function protectedShare(name: string, password = "correct horse battery") {
  const { user } = await createVerifiedUser(name);
  const p = await createProject(user.id, project(`${name} App`));
  await updateProjectAccess(user.id, p.id, { mode: "PASSWORD", password, ttlMinutes: 1440 });
  const token = await cliLogin(user.id);
  const t = await share(token, p.id);
  return { user, project: p, token, password, ...t };
}

const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();

async function signIn(host: string, password: string, next = "/") {
  const res = await publicRequest(gatewayPort, host, "/__localians/access", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
    body: form({ password, next }),
  });
  const setCookie = ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith(`${COOKIE}=`));
  return { res, cookie: setCookie?.split(";")[0] };
}

function openSocket(host: string, cookie?: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${gatewayPort}/socket`, { headers: { host, ...(cookie ? { cookie } : {}) } });
  return new Promise<{ ok: boolean; status?: number; ws: WebSocket }>((resolve) => {
    ws.once("open", () => resolve({ ok: true, ws }));
    ws.once("unexpected-response", (_req, res) => resolve({ ok: false, status: res.statusCode, ws }));
    ws.once("error", () => resolve({ ok: false, ws }));
  });
}

describe("password-protected previews", () => {
  it("blocks HTTP and API traffic until the right password, then serves the app (without leaking the access cookie)", async () => {
    const t = await protectedShare("Locked");
    const before = app.seen.length;

    const page = await publicRequest(gatewayPort, t.host, "/dashboard?tab=1", { headers: { accept: "text/html" } });
    expect(page.status).toBe(401);
    expect(page.headers["x-localians-gateway-error"]).toBe("protected");
    expect(page.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(page.body.toString()).toContain("This preview is password protected");
    expect(page.body.toString()).toContain('value="/dashboard?tab=1"'); // returns the visitor where they were going
    const api = await publicRequest(gatewayPort, t.host, "/echo", { method: "POST", body: "x", headers: { accept: "application/json" } });
    expect(api.status).toBe(401);
    expect(app.seen.length).toBe(before); // nothing reached the developer's app

    const wrong = await signIn(t.host, "not the password");
    expect(wrong.res.status).toBe(401);
    expect(wrong.res.body.toString()).toContain("That password isn");
    expect(wrong.cookie).toBeUndefined();

    const right = await signIn(t.host, t.password, "/dashboard?tab=1");
    expect(right.res.status).toBe(303);
    expect(right.res.headers.location).toBe("/dashboard?tab=1");
    const setCookie = String(right.res.headers["set-cookie"]);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);
    expect(setCookie).toMatch(/Max-Age=86400/);

    const ok = await publicRequest(gatewayPort, t.host, "/?q=1", { headers: { cookie: `${right.cookie}; app=1` } });
    expect(ok.status).toBe(200);
    expect(ok.body.toString()).toContain("Local app");
    const seen = app.seen[app.seen.length - 1];
    expect(seen.cookie).toBe("app=1"); // the access cookie never reaches the app

    // Open redirects are refused.
    for (const next of ["//evil.example/", "https://evil.example/", "/\\evil"]) {
      expect((await signIn(t.host, t.password, next)).res.headers.location).toBe("/");
    }
    t.agent.stop();
  });

  it("protects WebSockets the same way", async () => {
    const t = await protectedShare("Socket Lock");
    const denied = await openSocket(t.host);
    expect(denied.ok).toBe(false);
    expect(denied.status).toBe(401);
    const { cookie } = await signIn(t.host, t.password);
    const allowed = await openSocket(t.host, cookie);
    expect(allowed.ok).toBe(true);
    allowed.ws.close();
    t.agent.stop();
  });

  it("rejects cookies from another preview, tampered cookies and expired ones", async () => {
    const a = await protectedShare("Cookie A");
    const b = await protectedShare("Cookie B");
    const { cookie } = await signIn(a.host, a.password);
    expect((await publicRequest(gatewayPort, b.host, "/", { headers: { cookie: cookie! } })).status).toBe(401);

    const [name, value] = cookie!.split("=");
    const [payload, mac] = value.split(".");
    const tampered = `${name}=${Buffer.from(JSON.stringify({ l: b.session.label, v: 99, e: 4102444800 })).toString("base64url")}.${mac}`;
    expect((await publicRequest(gatewayPort, b.host, "/", { headers: { cookie: tampered } })).status).toBe(401);
    expect((await publicRequest(gatewayPort, a.host, "/", { headers: { cookie: `${name}=${payload}.AAAA` } })).status).toBe(401);

    const version = (await prisma.project.findUniqueOrThrow({ where: { id: a.project.id } })).accessVersion;
    const expired = signAccess(deriveAccessKey(GATEWAY_API_SECRET), a.session.label, { mode: "password", version, ttlS: 60 }, Date.now() - 3600_000);
    expect((await publicRequest(gatewayPort, a.host, "/", { headers: { cookie: `${COOKIE}=${expired.value}` } })).status).toBe(401);
    const fresh = signAccess(deriveAccessKey(GATEWAY_API_SECRET), a.session.label, { mode: "password", version, ttlS: 60 });
    expect((await publicRequest(gatewayPort, a.host, "/", { headers: { cookie: `${COOKIE}=${fresh.value}` } })).status).toBe(200);
    a.agent.stop();
    b.agent.stop();
  });

  it("changing the password or signing visitors out ends existing access at once; going public opens it", async () => {
    const t = await protectedShare("Rotate");
    const { cookie } = await signIn(t.host, t.password);
    expect((await publicRequest(gatewayPort, t.host, "/", { headers: { cookie: cookie! } })).status).toBe(200);

    const applied = await updateProjectAccess(t.user.id, t.project.id, { mode: "PASSWORD", password: "a brand new secret", ttlMinutes: 60 });
    expect(applied).toEqual({ previews: 1, pushed: 1 }); // pushed to the live gateway, not just saved
    expect((await publicRequest(gatewayPort, t.host, "/", { headers: { cookie: cookie! } })).status).toBe(401);
    expect((await signIn(t.host, t.password)).res.status).toBe(401); // old password no longer works
    const second = await signIn(t.host, "a brand new secret");
    expect(String(second.res.headers["set-cookie"])).toMatch(/Max-Age=3600/);
    expect((await publicRequest(gatewayPort, t.host, "/", { headers: { cookie: second.cookie! } })).status).toBe(200);

    await signOutVisitors(t.user.id, t.project.id);
    expect((await publicRequest(gatewayPort, t.host, "/", { headers: { cookie: second.cookie! } })).status).toBe(401);

    await updateProjectAccess(t.user.id, t.project.id, { mode: "PUBLIC", ttlMinutes: 60 });
    expect((await publicRequest(gatewayPort, t.host, "/")).status).toBe(200);
    const events = await prisma.tunnelEvent.findMany({ where: { sessionId: t.session.sessionId }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["PROTECTION_CHANGED", "VISITORS_SIGNED_OUT"]));
    t.agent.stop();
  });

  it("only workspace members can change a project's access, and passwords need 8+ characters", async () => {
    const t = await protectedShare("Owner Access");
    const { user: outsider } = await createVerifiedUser("Access Outsider");
    await expect(updateProjectAccess(outsider.id, t.project.id, { mode: "PUBLIC", ttlMinutes: 60 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(signOutVisitors(outsider.id, t.project.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateProjectAccess(t.user.id, t.project.id, { mode: "PASSWORD", password: "short", ttlMinutes: 60 })).rejects.toThrow();
    await expect(updateProjectAccess(t.user.id, t.project.id, { mode: "PASSWORD", ttlMinutes: 5 })).rejects.toThrow();
    const row = await prisma.project.findUniqueOrThrow({ where: { id: t.project.id } });
    expect(row.accessMode).toBe("PASSWORD");
    expect(row.accessPasswordHash).toMatch(/^scrypt\$/);
    expect(row.accessPasswordHash).not.toContain(t.password);
    t.agent.stop();
  });

  it("rate limits password guessing at the gateway and in the shared store", async () => {
    const t = await protectedShare("Brute");
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await signIn(t.host, `guess-${i}-xxxx`)).res.status);
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses.slice(5)).toEqual([429, 429]);
    // Even the right password is refused while limited.
    expect((await signIn(t.host, t.password)).res.status).toBe(429);

    // Control-plane limit (shared across gateways/instances): per visitor IP.
    const results = [];
    for (let i = 0; i < 9; i++) results.push((await verifyPreviewAccess(t.session.sessionId, "nope-nope", "198.51.100.7")).ok ? "ok" : "no");
    const last = await verifyPreviewAccess(t.session.sessionId, t.password, "198.51.100.7");
    expect(last).toMatchObject({ ok: false, error: "rate_limited" });
    expect(await verifyPreviewAccess(t.session.sessionId, t.password, "198.51.100.8")).toMatchObject({ ok: true });
    t.agent.stop();
  });

  it("fails closed: a preview whose access policy can't be confirmed serves 503, never the app", async () => {
    const t = await (async () => {
      const { user } = await createVerifiedUser("Fail Closed");
      const p = await createProject(user.id, project("Fail Closed App"));
      await updateProjectAccess(user.id, p.id, { mode: "PASSWORD", password: "correct horse battery", ttlMinutes: 60 });
      return { user, token: await cliLogin(user.id), project: p };
    })();
    const isolated = await startTestGateway(controlPlane.url, [], { report: async () => null, heartbeatIntervalMs: 100, gatewayId: "gw-isolated" });
    extra.push({ close: () => isolated.gateway.close() });
    const s = await share(t.token, t.project.id, `http://127.0.0.1:${isolated.port}`, () => true);
    await waitFor(() => isolated.gateway.hasTunnel(s.session.label), 5000, "registered");
    const res = await publicRequest(isolated.port, s.host, "/");
    expect(res.status).toBe(503);
    expect(res.headers["x-localians-gateway-error"]).toBe("unavailable");
    expect(res.body.toString()).not.toContain("Local app");
    // Readiness reports the control plane as unreachable (health stays up).
    await waitFor(async () => (await fetch(`${isolated.adminUrl}/readyz`)).status === 503, 5000, "not ready");
    expect((await fetch(`${isolated.adminUrl}/healthz`)).status).toBe(200);
    s.agent.stop();
  });
});

describe("share setup codes", () => {
  it("creates the project, applies protection and works once — only for the same user's CLI", async () => {
    const { user } = await createVerifiedUser("Setup User");
    const token = await cliLogin(user.id);
    const setup = await createShareSetup(user.id);
    await updateShareSetup(user.id, setup.id, { port: app.port, project: { kind: "new", name: "Client Portal" }, access: { mode: "PASSWORD", password: "setup password 1" } });

    const { user: other } = await createVerifiedUser("Setup Thief");
    const otherApi = createApi(controlPlane.url, await cliLogin(other.id), "test");
    await expect(otherApi.redeemSetup(setup.code, app.port)).rejects.toMatchObject({ status: 404 });

    const api = createApi(controlPlane.url, token, "test");
    const redeemed = await api.redeemSetup(setup.code, app.port);
    expect(redeemed.access).toBe("password");
    expect(redeemed.project).toMatchObject({ name: "Client Portal", defaultPort: app.port });
    const created = await prisma.project.findUniqueOrThrow({ where: { id: redeemed.project!.id } });
    expect(created.accessMode).toBe("PASSWORD");
    await expect(api.redeemSetup(setup.code, app.port)).rejects.toMatchObject({ status: 410, code: "setup_used" });
    await expect(api.redeemSetup("notavalidcod", app.port)).rejects.toMatchObject({ status: 404 });

    // The created project's previews are protected end to end.
    const t = await share(token, redeemed.project!.id);
    expect(t.session.access).toBe("password");
    expect((await publicRequest(gatewayPort, t.host, "/", { headers: { accept: "text/html" } })).status).toBe(401);
    expect((await signIn(t.host, "setup password 1")).res.status).toBe(303);
    t.agent.stop();
  });

  it("refuses expired codes, missing passwords and projects from other workspaces", async () => {
    const { user } = await createVerifiedUser("Setup Edge");
    const api = createApi(controlPlane.url, await cliLogin(user.id), "test");
    const { user: other } = await createVerifiedUser("Setup Other");
    const foreign = await createProject(other.id, project("Foreign"));

    const a = await createShareSetup(user.id);
    await expect(updateShareSetup(user.id, a.id, { port: 3000, project: { kind: "existing", id: foreign.id }, access: { mode: "PUBLIC" } })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateShareSetup(other.id, a.id, { port: 3000, project: { kind: "new", name: "" }, access: { mode: "PUBLIC" } })).rejects.toBeInstanceOf(NotFoundError);

    await updateShareSetup(user.id, a.id, { port: 3000, project: { kind: "new", name: "No Password" }, access: { mode: "PASSWORD" } });
    await expect(api.redeemSetup(a.code, 3000)).rejects.toMatchObject({ status: 404, message: expect.stringContaining("no password was set") });

    const b = await createShareSetup(user.id);
    await prisma.shareSetup.update({ where: { id: b.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(api.redeemSetup(b.code, 3000)).rejects.toMatchObject({ status: 410, code: "setup_expired" });

    // Neither project nor name: named after the app the CLI runs in (or "My app" from an older CLI).
    const c = await createShareSetup(user.id);
    await updateShareSetup(user.id, c.id, { port: 3000, project: { kind: "new", name: "" }, access: { mode: "PUBLIC" } });
    expect(await api.redeemSetup(c.code, 3000, { name: "acme-storefront", framework: "NEXTJS" })).toEqual({
      project: expect.objectContaining({ name: "acme-storefront", framework: "NEXTJS", defaultPort: 3000 }),
      access: "public",
      durationMinutes: null, // no duration chosen (e.g. a wizard tab opened before timers): the CLI uses the default
      url: null, // no link choice: the project's custom URL if it has a pass and one, else a random link
    });
    // …and the next unnamed setup on the same port reuses that project instead of creating another.
    const d = await createShareSetup(user.id);
    await updateShareSetup(user.id, d.id, { port: 3000, project: { kind: "new", name: "" }, access: { mode: "PUBLIC" } });
    expect((await api.redeemSetup(d.code, 3000, { name: "something-else", framework: null })).project?.name).toBe("acme-storefront");
  });

  it("regression: an unnamed new project chosen with a password is created protected (never silently public)", async () => {
    const { user } = await createVerifiedUser("Setup Unnamed");
    const token = await cliLogin(user.id);
    const api = createApi(controlPlane.url, token, "test");
    const setup = await createShareSetup(user.id);
    await updateShareSetup(user.id, setup.id, { port: app.port, project: { kind: "new", name: "" }, access: { mode: "PASSWORD", password: "unnamed password 1" } });

    const redeemed = await api.redeemSetup(setup.code, app.port, { name: "my-portfolio", framework: "REACT_VITE" });
    expect(redeemed.access).toBe("password");
    expect(redeemed.project).toMatchObject({ name: "my-portfolio", defaultPort: app.port });
    const t = await share(token, redeemed.project!.id);
    expect(t.session.access).toBe("password");
    expect((await publicRequest(gatewayPort, t.host, "/", { headers: { accept: "text/html" } })).status).toBe(401);
    expect((await signIn(t.host, "unnamed password 1")).res.status).toBe(303);
    t.agent.stop();
  });
});

describe("quotas and shared rate limits", () => {
  it("enforces the active-preview quota from the environment", async () => {
    process.env.QUOTA_ACTIVE_PREVIEWS_PER_USER = "1";
    const { user } = await createVerifiedUser("Quota User");
    const p = await createProject(user.id, project("Quota App"));
    const token = await cliLogin(user.id);
    const t = await share(token, p.id);
    await expect(createApi(controlPlane.url, token, "test").createTunnel(p.id, app.port)).rejects.toMatchObject({ status: 429, code: "too_many_tunnels" });
    t.agent.stop();
  });

  it("stops previews and refuses new ones when the daily bandwidth quota is used", async () => {
    process.env.QUOTA_DAILY_BANDWIDTH_MB = "1";
    const { user } = await createVerifiedUser("Bandwidth User");
    const p = await createProject(user.id, project("Bandwidth App"));
    const token = await cliLogin(user.id);
    const t = await share(token, p.id);
    expect((await publicRequest(gatewayPort, t.host, `/big?bytes=${1_200_000}`)).status).toBe(200);
    await gateway.heartbeat();
    expect(await t.agent.done).toBe("ended");
    expect(gateway.hasTunnel(t.session.label)).toBe(false);
    const row = await prisma.tunnelSession.findUniqueOrThrow({ where: { id: t.session.sessionId } });
    expect(row.endReason).toBe("Daily bandwidth limit reached");
    expect((await prisma.tunnelEvent.findFirst({ where: { sessionId: row.id, type: "QUOTA_EXCEEDED" } }))).not.toBeNull();
    await expect(createApi(controlPlane.url, token, "test").createTunnel(p.id, app.port)).rejects.toMatchObject({ status: 429, code: "bandwidth_quota" });
  });

  it("shares rate-limit windows across instances (PostgreSQL), even under concurrent hits", async () => {
    const key = `test-limit-${Date.now()}`;
    const results = await Promise.all(Array.from({ length: 20 }, () => rateLimit(key, 5, 60_000)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(results.every((r) => r.retryAfterS > 0)).toBe(true);
  });

  it("reports health", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, database: "ok", gateway: "ok" });
  });
});
