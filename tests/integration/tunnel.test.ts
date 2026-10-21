import http from "node:http";
import net from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { WebSocket } from "ws";
import { startAgent } from "@tunnel/cli/agent";
import { createApi } from "@tunnel/cli/api";
import { createGateway, type Gateway } from "@tunnel/gateway/gateway";
import { createLogger } from "@tunnel/gateway/log";
import { CONNECT_TOKEN_AUDIENCE, CONNECT_TOKEN_ISSUER } from "@tunnel/shared/protocol";
import { projectInputSchema } from "@/lib/validation/project";
import { revokeCliCredential } from "@/server/cli/credentials";
import { decideDeviceAuthorization } from "@/server/cli/device";
import { sweepStaleTunnels } from "@/server/cli/tunnels";
import { prisma } from "@/server/db";
import { archiveProject, createProject } from "@/server/projects";
import { createVerifiedUser } from "./helpers";
import {
  GATEWAY_API_SECRET,
  PREVIEW_DOMAIN,
  publicRequest,
  startControlPlane,
  startLocalApp,
  TUNNEL_HOST,
  TUNNEL_TOKEN_SECRET,
  waitFor,
} from "./tunnel-harness";

const project = (name: string, port = "3000") => projectInputSchema.parse({ name, description: "", framework: "NEXTJS", defaultPort: port });

let controlPlane: Awaited<ReturnType<typeof startControlPlane>>;
let gateway: Gateway;
let gatewayPort: number;
const logs: string[] = [];
const secretsSeen: string[] = [GATEWAY_API_SECRET, TUNNEL_TOKEN_SECRET];

beforeAll(async () => {
  Object.assign(process.env, {
    TUNNEL_PREVIEW_DOMAIN: PREVIEW_DOMAIN,
    TUNNEL_TOKEN_SECRET,
    GATEWAY_API_SECRET,
    TUNNEL_PUBLIC_SCHEME: "http",
    // Many logins come from one test IP; the limit itself is covered by its own test below.
    CLI_DEVICE_RATE_LIMIT: "1000",
  });
  controlPlane = await startControlPlane();
  gateway = createGateway(
    {
      host: "127.0.0.1",
      port: 0,
      tls: null,
      previewDomain: PREVIEW_DOMAIN,
      tunnelHost: TUNNEL_HOST,
      publicProto: "http",
      tokenSecret: new TextEncoder().encode(TUNNEL_TOKEN_SECRET),
      controlPlane: { url: controlPlane.url, apiSecret: GATEWAY_API_SECRET },
      gatewayId: "gw-test",
      adminPort: 0,
      adminHost: "127.0.0.1",
      trustedProxies: [],
      limits: {
        maxTunnels: 50,
        maxStreamsPerTunnel: 100,
        maxRequestBodyBytes: 2 * 1024 * 1024,
        maxResponseBytes: 8 * 1024 * 1024,
        responseTimeoutMs: 3000,
        idleTimeoutMs: 10_000,
        requestsPerSecondPerTunnel: 1000,
        requestsPerSecondPerIp: 1000,
      },
      heartbeatIntervalMs: 60_000, // heartbeats are triggered explicitly in tests
      pingTimeoutMs: 3000,
    },
    { log: createLogger((line) => logs.push(line)) },
  );
  gatewayPort = (await gateway.listen()).port;
  process.env.TUNNEL_GATEWAY_URL = `http://127.0.0.1:${gatewayPort}`;
  process.env.TUNNEL_PUBLIC_PORT = String(gatewayPort);
});

afterAll(async () => {
  await gateway?.close();
  await controlPlane?.close();
});

/** Runs the RFC 8628 device flow end to end; approval uses the same service the /cli/activate page calls. */
async function cliLogin(userId: string) {
  const api = createApi(controlPlane.url, null, "test");
  const start = await api.startDeviceLogin("CLI on test-machine (linux)");
  expect(start.user_code).toMatch(/^[A-Z]{4}-[A-Z]{4}$/);
  await expect(api.pollDeviceLogin(start.device_code)).rejects.toMatchObject({ code: "authorization_pending" });
  expect(await decideDeviceAuthorization(userId, start.user_code, true)).toBe(true);
  const result = await api.pollDeviceLogin(start.device_code);
  secretsSeen.push(result.access_token);
  return { token: result.access_token, deviceCode: start.device_code };
}

/** Mirrors `localians share`: create the session, connect the agent, wait until live. */
async function share(token: string, projectId: string, localPort: number) {
  const api = createApi(controlPlane.url, token, "test");
  const session = await api.createTunnel(projectId, localPort);
  secretsSeen.push(session.connectToken);
  let first: string | null = session.connectToken;
  const states: string[] = [];
  const agent = startAgent({
    gatewayUrl: session.gatewayUrl,
    localPort,
    localAddress: "127.0.0.1",
    getConnectToken: async () => {
      if (first) {
        const t = first;
        first = null;
        return t;
      }
      const t = await api.connectToken(session.sessionId);
      secretsSeen.push(t);
      return t;
    },
    onState: (s) => states.push(s),
  });
  await waitFor(() => agent.state === "connected" && gateway.hasTunnel(session.label), 10_000, "tunnel connected");
  await waitFor(async () => (await prisma.tunnelSession.findUniqueOrThrow({ where: { id: session.sessionId } })).status === "CONNECTED", 5000, "db connected");
  return { api, session, agent, states, host: `${session.label}.${PREVIEW_DOMAIN}` };
}

describe("CLI device login (RFC 8628)", () => {
  it("issues a scoped, hashed credential once and rejects reuse of the device code", async () => {
    const { user } = await createVerifiedUser("Device User");
    const { token, deviceCode } = await cliLogin(user.id);

    const stored = await prisma.cliCredential.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.tokenHash).not.toBe(token);
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 80 * 24 * 3600 * 1000);

    const api = createApi(controlPlane.url, null, "test");
    await expect(api.pollDeviceLogin(deviceCode)).rejects.toMatchObject({ code: "invalid_grant" });

    const me = await createApi(controlPlane.url, token, "test").me();
    expect(me.user.email).toBe(user.email);
  });

  it("reports denied and expired login requests", async () => {
    const { user } = await createVerifiedUser("Denier");
    const api = createApi(controlPlane.url, null, "test");
    const denied = await api.startDeviceLogin("CLI");
    await decideDeviceAuthorization(user.id, denied.user_code, false);
    await expect(api.pollDeviceLogin(denied.device_code)).rejects.toMatchObject({ code: "access_denied" });

    const expired = await api.startDeviceLogin("CLI");
    await prisma.deviceAuthorization.updateMany({ where: { userCode: expired.user_code.replace("-", "") }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(api.pollDeviceLogin(expired.device_code)).rejects.toMatchObject({ code: "expired_token" });
    expect(await decideDeviceAuthorization(user.id, expired.user_code, true)).toBe(false);
  });

  it("rejects invalid, expired and revoked CLI tokens", async () => {
    const { user } = await createVerifiedUser("Token User");
    const { token } = await cliLogin(user.id);
    await expect(createApi(controlPlane.url, "lcl_not-a-real-token", "test").me()).rejects.toMatchObject({ status: 401 });
    await expect(createApi(controlPlane.url, "Bearer junk", "test").me()).rejects.toMatchObject({ status: 401 });

    await prisma.cliCredential.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(createApi(controlPlane.url, token, "test").me()).rejects.toMatchObject({ status: 401 });

    const second = await cliLogin(user.id);
    const credential = await prisma.cliCredential.findFirstOrThrow({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } } });
    await revokeCliCredential(user.id, credential.id);
    await expect(createApi(controlPlane.url, second.token, "test").me()).rejects.toMatchObject({ status: 401 });
  });

  it("logout revokes the credential server-side", async () => {
    const { user } = await createVerifiedUser("Logout User");
    const { token } = await cliLogin(user.id);
    const api = createApi(controlPlane.url, token, "test");
    await api.logout();
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
  });
});

describe("tunnel session authorization", () => {
  it("binds sessions to projects the user owns, and refuses other users' projects", async () => {
    const alice = (await createVerifiedUser("Alice Tunnel")).user;
    const bob = (await createVerifiedUser("Bob Tunnel")).user;
    const aliceProject = await createProject(alice.id, project("Alice App"));
    const { token: bobToken } = await cliLogin(bob.id);

    await expect(createApi(controlPlane.url, bobToken, "test").createTunnel(aliceProject.id, 3000)).rejects.toMatchObject({ status: 404 });
    expect(await prisma.tunnelSession.count({ where: { projectId: aliceProject.id } })).toBe(0);
  });

  it("validates ports, archived projects and active-tunnel limits", async () => {
    const { user } = await createVerifiedUser("Limits User");
    const p = await createProject(user.id, project("Limits App"));
    const { token } = await cliLogin(user.id);
    const api = createApi(controlPlane.url, token, "test");

    await expect(api.createTunnel(p.id, 0)).rejects.toMatchObject({ status: 400 });
    await expect(api.createTunnel(p.id, 70000)).rejects.toMatchObject({ status: 400 });

    for (let i = 0; i < 5; i++) await api.createTunnel(p.id, 3000 + i);
    await expect(api.createTunnel(p.id, 4000)).rejects.toMatchObject({ status: 429 });

    const archived = await createProject(user.id, project("Archived App"));
    await archiveProject(user.id, archived.id);
    await expect(api.createTunnel(archived.id, 3000)).rejects.toMatchObject({ status: 409 });
  });

  it("allocates unique, unguessable hostnames and never reuses them", async () => {
    const { user } = await createVerifiedUser("Hostname User");
    const p = await createProject(user.id, project("Host App"));
    const { token } = await cliLogin(user.id);
    const api = createApi(controlPlane.url, token, "test");
    const a = await api.createTunnel(p.id, 3000);
    await api.closeTunnel(a.sessionId);
    const b = await api.createTunnel(p.id, 3000);
    expect(a.label).not.toBe(b.label);
    expect(a.publicUrl).toBe(`http://${a.label}.${PREVIEW_DOMAIN}:${gatewayPort}`);
  });

  it("rejects forged, reused and expired connect tokens at the gateway", async () => {
    const connect = (token: string) =>
      new Promise<number>((resolve) => {
        const req = http.request({ host: "127.0.0.1", port: gatewayPort, path: "/v1/connect", headers: { host: TUNNEL_HOST, connection: "Upgrade", upgrade: "localians-tunnel/1", authorization: `Bearer ${token}` } });
        req.on("response", (res) => resolve(res.statusCode ?? 0));
        req.on("upgrade", (res, socket) => {
          socket.destroy();
          resolve(101);
        });
        req.on("error", () => resolve(-1));
        req.end();
      });
    const sign = (secret: string, claims: Record<string, unknown>, exp = "60s") =>
      new SignJWT({ sid: "s", cid: "c", label: "abcdefghijkl", port: 3000, ...claims })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("u")
        .setIssuer(CONNECT_TOKEN_ISSUER)
        .setAudience(CONNECT_TOKEN_AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(exp)
        .setJti(`jti-${Math.random()}`)
        .sign(new TextEncoder().encode(secret));

    expect(await connect("garbage")).toBe(401);
    expect(await connect(await sign("wrong-secret-wrong-secret-wrong-secret-123", {}))).toBe(401);
    expect(await connect(await sign(TUNNEL_TOKEN_SECRET, {}, "-10s"))).toBe(401);

    const valid = await sign(TUNNEL_TOKEN_SECRET, {});
    expect(await connect(valid)).toBe(101);
    expect(await connect(valid)).toBe(401); // single use
  });
});

describe("forwarding through a live tunnel", () => {
  let tunnel: Awaited<ReturnType<typeof share>>;
  let app: Awaited<ReturnType<typeof startLocalApp>>;

  beforeAll(async () => {
    app = await startLocalApp();
    const { user } = await createVerifiedUser("Forward User");
    const p = await createProject(user.id, project("Forward App", String(app.port)));
    const { token } = await cliLogin(user.id);
    tunnel = await share(token, p.id, app.port);
  });

  afterAll(async () => {
    tunnel?.agent.stop();
    await app?.close();
  });

  it("serves the real local app with query strings, headers and cookies", async () => {
    const res = await publicRequest(gatewayPort, tunnel.host, "/?q=hello%20world", { headers: { "x-custom": "abc" } });
    expect(res.status).toBe(200);
    expect(res.body.toString()).toContain("<h1>Local app</h1>");
    expect(res.body.toString()).toContain("q=hello world");
    expect(res.headers["set-cookie"]).toEqual(["app=1; Path=/", "theme=dark; Path=/"]);
    expect(app.seen.at(-1)).toMatchObject({ host: `localhost:${app.port}`, custom: "abc" });
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])("forwards %s request bodies", async (method) => {
    const body = Buffer.from(`payload for ${method} ${"x".repeat(5000)}`);
    const res = await publicRequest(gatewayPort, tunnel.host, "/echo", { method, body, headers: { "content-type": "text/plain" } });
    expect(res.status).toBe(200);
    expect(res.headers["x-method"]).toBe(method);
    expect(res.body.equals(body)).toBe(true);
  });

  it("forwards HEAD and OPTIONS", async () => {
    const head = await publicRequest(gatewayPort, tunnel.host, "/echo", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.body.length).toBe(0);
    const options = await publicRequest(gatewayPort, tunnel.host, "/echo", { method: "OPTIONS" });
    expect(options.headers["x-method"]).toBe("OPTIONS");
  });

  it("forwards a 1.5 MB upload intact", async () => {
    const body = Buffer.alloc(1_500_000, 7);
    const res = await publicRequest(gatewayPort, tunnel.host, "/echo", { method: "POST", body });
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(body.length);
  });

  it("handles 50 concurrent requests", async () => {
    const results = await Promise.all(Array.from({ length: 50 }, (_, i) => publicRequest(gatewayPort, tunnel.host, `/?q=${i}`)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    results.forEach((r, i) => expect(r.body.toString()).toContain(`q=${i}`));
  });

  it("streams responses incrementally instead of buffering them", async () => {
    const arrivals: number[] = [];
    const started = Date.now();
    await new Promise<void>((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port: gatewayPort, path: "/stream", headers: { host: tunnel.host } }, (res) => {
        res.on("data", () => arrivals.push(Date.now() - started));
        res.on("end", resolve);
      });
      req.on("error", reject);
      req.end();
    });
    expect(arrivals.length).toBeGreaterThanOrEqual(4);
    // First event arrives long before the 5-event stream finishes (~750ms).
    expect(arrivals[0]).toBeLessThan(arrivals[arrivals.length - 1] - 300);
  });

  it("carries WebSocket messages both ways, plus ping/pong and close codes", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${gatewayPort}/socket?room=1`, { headers: { host: tunnel.host } });
    const messages: string[] = [];
    ws.on("message", (d) => messages.push(d.toString()));
    await new Promise((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    await waitFor(() => messages.includes("hello /socket?room=1"), 5000, "server push");
    ws.send("ping-from-browser");
    await waitFor(() => messages.includes("echo:ping-from-browser"), 5000, "echo");

    const pong = new Promise((resolve) => ws.once("pong", resolve));
    ws.ping("p");
    await pong;

    ws.close(4001, "bye");
    await waitFor(() => app.closes.some((c) => c.code === 4001 && c.reason === "bye"), 5000, "close propagated");
  });

  it("sanitises spoofed forwarding headers, internal headers and Localians cookies", async () => {
    await publicRequest(gatewayPort, tunnel.host, "/", {
      headers: {
        "x-forwarded-for": "6.6.6.6",
        forwarded: "for=6.6.6.6",
        "x-localians-upgrade": "websocket",
        cookie: "localians.session_token=SESSION-SECRET; cart=2",
      },
    });
    const seen = app.seen.at(-1)!;
    expect(seen.xff).toBe("127.0.0.1");
    expect(seen.forwarded).toBe(`for=127.0.0.1;host=${tunnel.host};proto=http`);
    expect(seen.internal).toBeUndefined();
    expect(seen.cookie).toBe("cart=2");
  });

  it("rejects oversized requests", async () => {
    const declared = await publicRequest(gatewayPort, tunnel.host, "/echo", { method: "POST", body: Buffer.alloc(3 * 1024 * 1024) });
    expect(declared.status).toBe(413);
  });

  it("meters traffic and reports it to the control plane", async () => {
    await publicRequest(gatewayPort, tunnel.host, "/big?bytes=200000");
    await gateway.heartbeat();
    const row = await prisma.tunnelSession.findUniqueOrThrow({ where: { id: tunnel.session.sessionId } });
    expect(Number(row.bytesOut)).toBeGreaterThanOrEqual(200_000);
    expect(row.requestCount).toBeGreaterThan(10);
    expect(row.lastHeartbeatAt).not.toBeNull();
  });

  it("forwards to the local app only — the request can't pick another target", async () => {
    // Paths that look like other hosts or the gateway's own endpoints still reach the developer's app, unchanged.
    for (const path of ["/metrics", "//127.0.0.1:22/", "/%2e%2e/admin", "/v1/connect"]) {
      const before = app.seen.length;
      const res = await publicRequest(gatewayPort, tunnel.host, path);
      expect(app.seen.length).toBe(before + 1);
      expect(res.body.toString()).toMatch(/Local app|app metrics page|app 404/);
    }
    expect((await publicRequest(gatewayPort, tunnel.host, "/metrics")).body.toString()).toBe("app metrics page");
  });
});

describe("routing and gateway hardening", () => {
  it("does not route unknown or malformed hostnames", async () => {
    expect((await publicRequest(gatewayPort, `zzzzzzzzzzzz.${PREVIEW_DOMAIN}`, "/")).status).toBe(404);
    expect((await publicRequest(gatewayPort, `not-a-label.${PREVIEW_DOMAIN}`, "/")).status).toBe(404);
    expect((await publicRequest(gatewayPort, "evil.example", "/")).status).toBe(404);
    expect((await publicRequest(gatewayPort, `abcdefghijkl.${PREVIEW_DOMAIN}.evil.example`, "/")).status).toBe(404);
    expect((await publicRequest(gatewayPort, TUNNEL_HOST, "/v1/connect")).status).toBe(404);
  });

  it("refuses proxy-style absolute request targets (no open proxy)", async () => {
    const response = await new Promise<string>((resolve) => {
      const socket = net.connect(gatewayPort, "127.0.0.1", () => {
        socket.write(`GET http://169.254.169.254/latest/meta-data HTTP/1.1\r\nHost: abcdefghijkl.${PREVIEW_DOMAIN}\r\nConnection: close\r\n\r\n`);
      });
      let data = "";
      socket.on("data", (d) => (data += d.toString()));
      socket.on("end", () => resolve(data));
    });
    expect(response).toMatch(/^HTTP\/1\.1 400/);
  });

  it("keeps the gateway admin API off the public listener", async () => {
    const res = await publicRequest(gatewayPort, TUNNEL_HOST, "/metrics");
    expect(res.status).toBe(404);
    expect(res.body.toString()).not.toContain("activeStreams");
  });

  it("protects the control-plane gateway API with its secret", async () => {
    const res = await fetch(`${controlPlane.url}/api/internal/gateway/events`, {
      method: "POST",
      headers: { authorization: "Bearer wrong", "content-type": "application/json" },
      body: JSON.stringify({ gatewayId: "x", events: [] }),
    });
    expect(res.status).toBe(401);
  });
});

describe("lifecycle: disconnects, reconnects, expiry and revocation", () => {
  it("serves an error page — not stale content — when the local server stops", async () => {
    const app = await startLocalApp();
    const { user } = await createVerifiedUser("Shutdown User");
    const p = await createProject(user.id, project("Shutdown App", String(app.port)));
    const { token } = await cliLogin(user.id);
    const t = await share(token, p.id, app.port);
    expect((await publicRequest(gatewayPort, t.host, "/")).status).toBe(200);

    await app.close();
    const down = await publicRequest(gatewayPort, t.host, "/");
    expect(down.status).toBe(502);
    expect(down.headers["x-localians-gateway-error"]).toBe("local-unreachable");
    expect(down.body.toString()).toContain("The app isn't running");
    t.agent.stop();
  });

  it("stops serving as soon as the CLI stops, and records the session as ended", async () => {
    const app = await startLocalApp();
    const { user } = await createVerifiedUser("Stop User");
    const p = await createProject(user.id, project("Stop App", String(app.port)));
    const { token } = await cliLogin(user.id);
    const t = await share(token, p.id, app.port);

    t.agent.stop();
    expect(await t.agent.done).toBe("user");
    await t.api.closeTunnel(t.session.sessionId);
    await waitFor(() => !gateway.hasTunnel(t.session.label), 5000, "tunnel removed");
    const res = await publicRequest(gatewayPort, t.host, "/");
    expect(res.status).toBe(404);
    expect(res.body.toString()).not.toContain("Local app");
    expect((await prisma.tunnelSession.findUniqueOrThrow({ where: { id: t.session.sessionId } })).status).toBe("DISCONNECTED");
    await app.close();
  });

  it("reconnects after a network interruption and keeps the same URL", async () => {
    const app = await startLocalApp();
    const { user } = await createVerifiedUser("Reconnect User");
    const p = await createProject(user.id, project("Reconnect App", String(app.port)));
    const { token } = await cliLogin(user.id);
    const t = await share(token, p.id, app.port);

    gateway.disconnect(t.session.label, "simulated network drop");
    await waitFor(async () => (await prisma.tunnelSession.findUniqueOrThrow({ where: { id: t.session.sessionId } })).status === "RECONNECTING", 5000, "reconnecting state");
    await waitFor(() => t.states.includes("reconnecting"), 5000, "agent reconnecting");
    await waitFor(() => gateway.hasTunnel(t.session.label), 15_000, "reconnected");
    await waitFor(async () => (await prisma.tunnelSession.findUniqueOrThrow({ where: { id: t.session.sessionId } })).status === "CONNECTED", 5000, "connected again");

    const res = await publicRequest(gatewayPort, t.host, "/");
    expect(res.status).toBe(200);
    t.agent.stop();
    await app.close();
  });

  it("terminates tunnels when the CLI credential is revoked", async () => {
    const app = await startLocalApp();
    const { user } = await createVerifiedUser("Revoke User");
    const p = await createProject(user.id, project("Revoke App", String(app.port)));
    const { token } = await cliLogin(user.id);
    const t = await share(token, p.id, app.port);
    const credential = await prisma.cliCredential.findFirstOrThrow({ where: { userId: user.id } });

    await revokeCliCredential(user.id, credential.id);
    await gateway.heartbeat();
    expect(await t.agent.done).toBe("auth");
    expect(gateway.hasTunnel(t.session.label)).toBe(false);
    expect((await publicRequest(gatewayPort, t.host, "/")).status).toBe(404);
    expect((await prisma.tunnelSession.findUniqueOrThrow({ where: { id: t.session.sessionId } })).status).toBe("REVOKED");
    await app.close();
  });

  it("ends sessions that pass their maximum lifetime", async () => {
    const app = await startLocalApp();
    const { user } = await createVerifiedUser("Expiry User");
    const p = await createProject(user.id, project("Expiry App", String(app.port)));
    const { token } = await cliLogin(user.id);
    const t = await share(token, p.id, app.port);

    await prisma.tunnelSession.update({ where: { id: t.session.sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await gateway.heartbeat();
    expect(await t.agent.done).toBe("ended");
    expect((await prisma.tunnelSession.findUniqueOrThrow({ where: { id: t.session.sessionId } })).status).toBe("EXPIRED");
    await expect(t.api.connectToken(t.session.sessionId)).rejects.toMatchObject({ status: 410 });
    await app.close();
  });

  it("expires sessions whose gateway heartbeat went stale (e.g. a crashed CLI)", async () => {
    const { user } = await createVerifiedUser("Stale User");
    const p = await createProject(user.id, project("Stale App"));
    const session = await prisma.tunnelSession.create({
      data: { projectId: p.id, userId: user.id, hostname: "stalestalest", localPort: 3000, status: "CONNECTED", lastHeartbeatAt: new Date(Date.now() - 5 * 60_000), expiresAt: new Date(Date.now() + 3600_000) },
    });
    await sweepStaleTunnels();
    expect((await prisma.tunnelSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe("EXPIRED");
  });
});

describe("secrets in logs", () => {
  it("never writes tokens, secrets or cookies to gateway logs", () => {
    const joined = logs.join("\n");
    expect(logs.length).toBeGreaterThan(20);
    for (const secret of secretsSeen) expect(joined).not.toContain(secret);
    expect(joined).not.toContain("SESSION-SECRET");
    expect(joined).not.toContain("hello%20world"); // query strings are redacted
  });
});
