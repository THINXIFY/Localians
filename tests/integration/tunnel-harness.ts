import http from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";

export const TUNNEL_TOKEN_SECRET = "tunnel-token-secret-for-tests-only-0123456789";
export const GATEWAY_API_SECRET = "gateway-api-secret-for-tests-only-0123456789";
export const PREVIEW_DOMAIN = "preview.test";
/** The CLI dials the gateway at 127.0.0.1 in tests, so that is the tunnel host the gateway accepts connections on. */
export const TUNNEL_HOST = "127.0.0.1";

type RouteHandler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

/**
 * Serves the real Next.js route handlers (they're plain Request → Response functions)
 * from a Node HTTP server, so the CLI talks to the actual control-plane code.
 */
export async function startControlPlane() {
  const routes: { pattern: RegExp; method: string; handler: RouteHandler }[] = [];
  const add = (method: string, pattern: RegExp, handler: RouteHandler) => routes.push({ method, pattern, handler });

  const deviceCode = await import("@/app/api/cli/device/code/route");
  const deviceToken = await import("@/app/api/cli/device/token/route");
  const me = await import("@/app/api/cli/me/route");
  const logout = await import("@/app/api/cli/logout/route");
  const projects = await import("@/app/api/cli/projects/route");
  const tunnels = await import("@/app/api/cli/tunnels/route");
  const connectToken = await import("@/app/api/cli/tunnels/[sessionId]/connect-token/route");
  const close = await import("@/app/api/cli/tunnels/[sessionId]/close/route");
  const gatewayEvents = await import("@/app/api/internal/gateway/events/route");
  const gatewayAccess = await import("@/app/api/internal/gateway/access/route");
  const setup = await import("@/app/api/cli/setup/route");

  add("POST", /^\/api\/cli\/device\/code$/, deviceCode.POST as RouteHandler);
  add("POST", /^\/api\/cli\/device\/token$/, deviceToken.POST as RouteHandler);
  add("GET", /^\/api\/cli\/me$/, me.GET as RouteHandler);
  add("POST", /^\/api\/cli\/logout$/, logout.POST as RouteHandler);
  add("POST", /^\/api\/cli\/projects$/, projects.POST as RouteHandler);
  add("POST", /^\/api\/cli\/tunnels$/, tunnels.POST as RouteHandler);
  add("GET", /^\/api\/cli\/tunnels$/, tunnels.GET as RouteHandler);
  add("POST", /^\/api\/cli\/tunnels\/(?<sessionId>[^/]+)\/connect-token$/, connectToken.POST as RouteHandler);
  add("POST", /^\/api\/cli\/tunnels\/(?<sessionId>[^/]+)\/close$/, close.POST as RouteHandler);
  add("POST", /^\/api\/internal\/gateway\/events$/, gatewayEvents.POST as RouteHandler);
  add("POST", /^\/api\/internal\/gateway\/access$/, gatewayAccess.POST as RouteHandler);
  add("POST", /^\/api\/cli\/setup$/, setup.POST as RouteHandler);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://control-plane.test");
    const route = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));
    if (!route) {
      res.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const request = new Request(url, {
      method: req.method,
      headers: Object.entries(req.headers).flatMap(([k, v]) => (v === undefined ? [] : Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]])) as [string, string][],
      body: req.method === "GET" ? undefined : Buffer.concat(chunks),
    });
    const params = route.pattern.exec(url.pathname)?.groups ?? {};
    const response = await route.handler(request, { params: Promise.resolve({ ...params }) });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

/** A local "developer app" with HTTP and WebSocket endpoints. */
export async function startLocalApp() {
  const seen: { host?: string; xff?: string; forwarded?: string; cookie?: string; internal?: string; custom?: string }[] = [];
  const server = http.createServer(async (req, res) => {
    seen.push({
      host: req.headers.host,
      xff: req.headers["x-forwarded-for"] as string,
      forwarded: req.headers.forwarded,
      cookie: req.headers.cookie,
      internal: req.headers["x-localians-upgrade"] as string,
      custom: req.headers["x-custom"] as string,
    });
    const url = new URL(req.url ?? "/", "http://local");
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html", "set-cookie": ["app=1; Path=/", "theme=dark; Path=/"] });
      return res.end(`<h1>Local app</h1><p>q=${url.searchParams.get("q") ?? ""}</p>`);
    }
    if (url.pathname === "/echo") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks);
      res.writeHead(200, { "content-type": "application/octet-stream", "x-method": req.method ?? "" });
      return res.end(req.method === "HEAD" ? undefined : body);
    }
    if (url.pathname === "/stream") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      let n = 0;
      const timer = setInterval(() => {
        res.write(`data: ${n++}\n\n`);
        if (n === 5) {
          clearInterval(timer);
          res.end();
        }
      }, 150);
      req.on("close", () => clearInterval(timer));
      return;
    }
    if (url.pathname === "/slow") {
      await new Promise((r) => setTimeout(r, Number(url.searchParams.get("ms") ?? 2000)));
      res.writeHead(200).end("slow");
      return;
    }
    if (url.pathname === "/big") {
      const size = Number(url.searchParams.get("bytes") ?? 1024);
      res.writeHead(200, { "content-type": "application/octet-stream", "content-length": size });
      return res.end(Buffer.alloc(size, 97));
    }
    if (url.pathname === "/metrics") return res.writeHead(200).end("app metrics page");
    res.writeHead(404).end("app 404");
  });

  const closes: { code: number; reason: string }[] = [];
  const wss = new WebSocketServer({ server });
  wss.on("connection", (ws, req) => {
    ws.send(`hello ${req.url}`);
    ws.on("message", (data) => ws.send(`echo:${data.toString()}`));
    ws.on("close", (code, reason) => closes.push({ code, reason: reason.toString() }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    port,
    seen,
    closes,
    close: () =>
      new Promise<void>((resolve) => {
        for (const client of wss.clients) client.terminate();
        wss.close();
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** Sends a request to the gateway as a public visitor of `<label>.preview.test`. */
export function publicRequest(
  gatewayPort: number,
  host: string,
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: Buffer | string; rawTarget?: boolean } = {},
) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    // Like browsers, always declare the body length (Node's client won't chunk DELETE bodies by default).
    const length = init.body !== undefined ? { "content-length": String(Buffer.byteLength(init.body)) } : {};
    const req = http.request(
      { host: "127.0.0.1", port: gatewayPort, method: init.method ?? "GET", path, headers: { host, ...length, ...init.headers }, agent: false },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

export const waitFor = async (check: () => boolean | Promise<boolean>, timeoutMs = 10_000, label = "condition") => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
};

/** A real gateway (plain HTTP) wired to the in-process control plane, with its private admin/control listener. */
export async function startTestGateway(controlPlaneUrl: string, logs: string[] = [], overrides: { report?: () => Promise<null>; heartbeatIntervalMs?: number; gatewayId?: string } = {}) {
  const { createGateway } = await import("@tunnel/gateway/gateway");
  const { createLogger } = await import("@tunnel/gateway/log");
  const gateway = createGateway(
    {
      host: "127.0.0.1",
      port: 0,
      tls: null,
      previewDomain: PREVIEW_DOMAIN,
      tunnelHost: TUNNEL_HOST,
      publicProto: "http",
      tokenSecret: new TextEncoder().encode(TUNNEL_TOKEN_SECRET),
      controlPlane: { url: controlPlaneUrl, apiSecret: GATEWAY_API_SECRET },
      gatewayId: overrides.gatewayId ?? "gw-test",
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
      heartbeatIntervalMs: overrides.heartbeatIntervalMs ?? 60_000, // heartbeats are triggered explicitly in tests
      pingTimeoutMs: 3000,
    },
    { log: createLogger((line) => logs.push(line)), ...(overrides.report ? { report: overrides.report } : {}) },
  );
  const { port, adminPort } = await gateway.listen();
  return { gateway, port, adminUrl: `http://127.0.0.1:${adminPort}` };
}
