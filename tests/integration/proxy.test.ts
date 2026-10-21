import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { startAgent } from "@tunnel/cli/agent";
import { createApi } from "@tunnel/cli/api";
import { createGateway, type Gateway } from "@tunnel/gateway/gateway";
import { createLogger } from "@tunnel/gateway/log";
import { projectInputSchema } from "@/lib/validation/project";
import { updateProjectAccess } from "@/server/access";
import { decideDeviceAuthorization } from "@/server/cli/device";
import { createProject } from "@/server/projects";
import { createVerifiedUser } from "./helpers";
import { GATEWAY_API_SECRET, PREVIEW_DOMAIN, startControlPlane, startLocalApp, TUNNEL_TOKEN_SECRET, waitFor } from "./tunnel-harness";

/**
 * The production layout: Nginx terminates TLS on 443 and proxies to the gateway on 127.0.0.1.
 * This proxy mirrors the shipped Nginx config (deploy/nginx): Host preserved, X-Forwarded-For
 * appended with the client address, X-Forwarded-Proto https, and *any* Upgrade (the CLI's
 * `localians-tunnel/1` as well as WebSockets) relayed as raw bytes after the 101 — which is how
 * Nginx's `proxy_set_header Upgrade $http_upgrade` behaves. Clients appear to come from
 * CLIENT_IP, as they would from the internet.
 */
const CLIENT_IP = "203.0.113.9";
// The CLI dials the proxy at 127.0.0.1, and the proxy forwards Host unchanged, so that is the tunnel host here.
const TUNNEL_HOST = "127.0.0.1";

function startNginxLikeProxy(upstreamPort: number) {
  const forwardHeaders = (req: http.IncomingMessage) => {
    const prior = req.headers["x-forwarded-for"];
    return { ...req.headers, "x-forwarded-for": prior ? `${prior}, ${CLIENT_IP}` : CLIENT_IP, "x-forwarded-proto": "https", "x-real-ip": CLIENT_IP };
  };
  const server = http.createServer((req, res) => {
    const upstream = http.request({ host: "127.0.0.1", port: upstreamPort, method: req.method, path: req.url, headers: forwardHeaders(req) }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    upstream.on("error", () => res.writeHead(502).end());
    req.pipe(upstream);
  });
  server.on("upgrade", (req, socket, head) => {
    const upstream = net.connect(upstreamPort, "127.0.0.1", () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (const [k, v] of Object.entries(forwardHeaders(req))) for (const value of Array.isArray(v) ? v : [v]) if (value !== undefined) lines.push(`${k}: ${value}`);
      upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    const close = () => {
      socket.destroy();
      upstream.destroy();
    };
    upstream.on("error", close);
    socket.on("error", close);
  });
  return new Promise<{ port: number; close: () => Promise<void> }>((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({
        port: (server.address() as AddressInfo).port,
        close: () =>
          new Promise<void>((r) => {
            server.closeAllConnections();
            server.close(() => r());
          }),
      }),
    ),
  );
}

let controlPlane: Awaited<ReturnType<typeof startControlPlane>>;
let gateway: Gateway;
let proxy: Awaited<ReturnType<typeof startNginxLikeProxy>>;
let app: Awaited<ReturnType<typeof startLocalApp>>;

beforeAll(async () => {
  Object.assign(process.env, { TUNNEL_PREVIEW_DOMAIN: PREVIEW_DOMAIN, TUNNEL_TOKEN_SECRET, GATEWAY_API_SECRET, TUNNEL_PUBLIC_SCHEME: "https", CLI_DEVICE_RATE_LIMIT: "1000" });
  controlPlane = await startControlPlane();
  // As in production: plain HTTP on loopback, "https" to the public, Nginx as the only trusted proxy.
  gateway = createGateway(
    {
      host: "127.0.0.1",
      port: 0,
      tls: null,
      previewDomain: PREVIEW_DOMAIN,
      tunnelHost: TUNNEL_HOST,
      publicProto: "https",
      tokenSecret: new TextEncoder().encode(TUNNEL_TOKEN_SECRET),
      controlPlane: { url: controlPlane.url, apiSecret: GATEWAY_API_SECRET },
      gatewayId: "gw-behind-proxy",
      adminPort: 0,
      adminHost: "127.0.0.1",
      trustedProxies: ["127.0.0.1"],
      limits: {
        maxTunnels: 10,
        maxStreamsPerTunnel: 50,
        maxRequestBodyBytes: 1024 * 1024,
        maxResponseBytes: 4 * 1024 * 1024,
        responseTimeoutMs: 3000,
        idleTimeoutMs: 10_000,
        requestsPerSecondPerTunnel: 1000,
        requestsPerSecondPerIp: 1000,
      },
      heartbeatIntervalMs: 60_000,
      pingTimeoutMs: 3000,
    },
    { log: createLogger(() => {}) },
  );
  const { port, adminPort } = await gateway.listen();
  process.env.GATEWAY_CONTROL_URL = `http://127.0.0.1:${adminPort}`;
  proxy = await startNginxLikeProxy(port);
  process.env.TUNNEL_GATEWAY_URL = `http://127.0.0.1:${proxy.port}`;
  app = await startLocalApp();
});

afterAll(async () => {
  await app?.close();
  await proxy?.close();
  await gateway?.close();
  await controlPlane?.close();
});

function viaProxy(host: string, path: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: proxy.port, method: init.method ?? "GET", path, headers: { host, ...init.headers }, agent: false }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

describe("gateway behind an Nginx-style TLS reverse proxy (production layout)", () => {
  it("accepts CLI tunnels through the proxy, serves visitors, records the real client IP and issues secure cookies", async () => {
    const { user } = await createVerifiedUser("Proxy User");
    const p = await createProject(user.id, projectInputSchema.parse({ name: "Proxy App", description: "", framework: "", defaultPort: "5173" }));
    const login = createApi(controlPlane.url, null, "test");
    const start = await login.startDeviceLogin("CLI on proxy-test");
    await decideDeviceAuthorization(user.id, start.user_code, true);
    const api = createApi(controlPlane.url, (await login.pollDeviceLogin(start.device_code)).access_token, "test");

    const session = await api.createTunnel(p.id, app.port);
    expect(session.publicUrl).toBe(`https://${session.label}.${PREVIEW_DOMAIN}`); // public links are https on 443, no port
    let first: string | null = session.connectToken;
    const agent = startAgent({
      // The CLI dials the tunnel host *through the proxy* (Upgrade: localians-tunnel/1 relayed like Nginx does).
      gatewayUrl: `http://127.0.0.1:${proxy.port}`,
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
      userAgent: "localians-cli/test",
    });
    await waitFor(() => agent.state === "connected" && gateway.hasTunnel(session.label), 10_000, "tunnel via proxy");

    const host = `${session.label}.${PREVIEW_DOMAIN}`;
    const page = await viaProxy(host, "/?q=1", { headers: { "x-forwarded-for": "6.6.6.6" } });
    expect(page.status).toBe(200);
    expect(page.body).toContain("Local app");
    const seen = app.seen[app.seen.length - 1];
    // A spoofed X-Forwarded-For from the visitor is replaced; the app sees the address Nginx saw.
    expect(seen.xff).toBe(CLIENT_IP);
    expect(seen.forwarded).toContain("proto=https");

    // WebSocket through proxy → gateway → tunnel → app.
    const ws = new WebSocket(`ws://127.0.0.1:${proxy.port}/socket`, { headers: { host } });
    const hello = await new Promise<string>((resolve, reject) => {
      ws.once("message", (d) => resolve(d.toString()));
      ws.once("error", reject);
    });
    expect(hello).toBe("hello /socket");
    ws.close();

    // Password protection over https: the access cookie is __Host- prefixed and Secure.
    await updateProjectAccess(user.id, p.id, { mode: "PASSWORD", password: "proxy password 1", ttlMinutes: 60 });
    expect((await viaProxy(host, "/", { headers: { accept: "text/html" } })).status).toBe(401);
    const signIn = await viaProxy(host, "/__localians/access", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
      body: "password=proxy+password+1&next=%2F",
    });
    expect(signIn.status).toBe(303);
    const cookie = String(signIn.headers["set-cookie"]);
    expect(cookie).toMatch(/^__Host-localians\.preview_access=/);
    expect(cookie).toMatch(/; Secure/);
    agent.stop();
  });
});
