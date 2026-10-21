import http from "node:http";
import http2 from "node:http2";
import https from "node:https";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Transform } from "node:stream";
import { jwtVerify } from "jose";
import { redactPath, sanitizeRequestHeaders, sanitizeResponseHeaders } from "../shared/headers";
import {
  CONNECT_PATH,
  CONNECT_TOKEN_AUDIENCE,
  CONNECT_TOKEN_ISSUER,
  ACCESS_PATHS,
  type AccessCheckRequest,
  type AccessCheckResponse,
  type AccessPolicy,
  type ConnectionCounters,
  type GatewayEvent,
  type GatewayEventsResponse,
  type GatewayTerminateResponse,
  type GatewayTunnelsResponse,
  H,
  LABEL_PATTERN,
  PROTOCOL_UPGRADE,
} from "../shared/protocol";
import type { GatewayConfig } from "./config";
import { clearCookieHeader, cookieName, deriveAccessKey, GATEWAY_PAGE_HEADERS, loginPage, type LoginMessage, readCookie, safeNext, setCookieHeader, signAccess, verifyAccess } from "./access";
import { createAccessChecker, createControlPlaneClient } from "./control-plane";
import { RateLimiter, ReplayGuard } from "./limits";
import { createLogger, type Logger } from "./log";
import { errorPage, type GatewayErrorKind } from "./pages";

const { NGHTTP2_CANCEL } = http2.constants;

type Tunnel = {
  label: string;
  sessionId: string;
  /** This physical connection (a reconnect gets a new one). */
  connectionId: string;
  userId: string;
  session: http2.ClientHttp2Session;
  socket: Duplex;
  connectedAt: number;
  activeStreams: number;
  /** Cumulative for this connection; reported as-is (the control plane applies the increase). */
  totals: ConnectionCounters;
  /** Who may open the preview. null until the control plane confirms it: requests then get 503 (fail closed). */
  policy: AccessPolicy | null;
  closed: boolean;
};

type Report = (events: GatewayEvent[]) => Promise<GatewayEventsResponse | null>;
type CheckAccess = (request: AccessCheckRequest) => Promise<AccessCheckResponse | null>;

export type Gateway = ReturnType<typeof createGateway>;

/** Disconnect reports that couldn't be delivered are retried with the next heartbeat (bounded). */
const MAX_UNDELIVERED = 1000;

export function createGateway(config: GatewayConfig, deps: { log?: Logger; report?: Report; checkAccess?: CheckAccess } = {}) {
  const log = deps.log ?? createLogger();
  const report = deps.report ?? createControlPlaneClient({ ...config.controlPlane, gatewayId: config.gatewayId }, log);
  const checkAccess = deps.checkAccess ?? createAccessChecker(config.controlPlane, log);
  const accessKey = deriveAccessKey(config.controlPlane.apiSecret);
  const secureCookies = config.publicProto === "https";
  const accessCookie = cookieName(secureCookies);
  // Password attempts per visitor IP at this gateway (the control plane also limits them, shared across instances).
  const loginRate = new RateLimiter(0.2, 5);
  // Readiness: set when reports to the control plane start failing, cleared on the next success.
  let reportFailingSince: number | null = null;
  const tunnels = new Map<string, Tunnel>();
  const tunnelRate = new RateLimiter(config.limits.requestsPerSecondPerTunnel);
  const ipRate = new RateLimiter(config.limits.requestsPerSecondPerIp);
  const replay = new ReplayGuard();
  /** Sessions stopped by the control plane: refused at connect time even with a still-valid connect token. */
  const blockedSessions = new Map<string, number>();
  let undelivered: GatewayEvent[] = [];
  const startedAt = Date.now();

  function isBlocked(sessionId: string) {
    const until = blockedSessions.get(sessionId);
    if (until === undefined) return false;
    if (until > Date.now()) return true;
    blockedSessions.delete(sessionId);
    return false;
  }

  function block(sessionId: string) {
    // Connect tokens live 2 minutes; a day comfortably outlasts any token minted before the stop.
    blockedSessions.set(sessionId, Date.now() + 24 * 60 * 60 * 1000);
    if (blockedSessions.size > 100_000) {
      for (const [id, until] of blockedSessions) if (until <= Date.now()) blockedSessions.delete(id);
    }
  }

  /** Sends events; anything undeliverable is queued and retried (reports are idempotent). */
  async function deliver(events: GatewayEvent[]) {
    const batch = [...undelivered, ...events];
    undelivered = [];
    if (!batch.length) return { sessions: {} } as GatewayEventsResponse;
    const verdict = await report(batch);
    if (verdict) reportFailingSince = null;
    else reportFailingSince ??= Date.now();
    if (!verdict) {
      // Heartbeats are superseded by the next one; lifecycle reports must eventually arrive.
      undelivered = [...batch.filter((e) => e.type !== "heartbeat"), ...undelivered].slice(-MAX_UNDELIVERED);
    }
    return verdict;
  }

  const server = config.tls
    ? https.createServer({ cert: config.tls.cert, key: config.tls.key, minVersion: "TLSv1.2" }, onRequest)
    : http.createServer(onRequest);
  server.headersTimeout = 30_000;
  server.keepAliveTimeout = 65_000;
  server.on("upgrade", (req, socket, head) => {
    onUpgrade(req, socket, head).catch((error) => {
      log("error", "upgrade handler failed", { error: error instanceof Error ? error.message : "unknown" });
      socket.destroy();
    });
  });
  server.on("clientError", (_err, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  });

  // ---------------------------------------------------------------- helpers

  function parseHostname(raw: string | string[] | undefined) {
    if (typeof raw !== "string") return null;
    const match = /^([a-z0-9.-]{1,253})(?::(\d{1,5}))?$/.exec(raw.trim().toLowerCase());
    return match ? match[1] : null;
  }

  function labelFor(hostname: string) {
    const suffix = `.${config.previewDomain}`;
    if (!hostname.endsWith(suffix)) return null;
    const label = hostname.slice(0, -suffix.length);
    return LABEL_PATTERN.test(label) ? label : null;
  }

  const normalizeIp = (ip: string | undefined) => (ip ?? "").replace(/^::ffff:/, "");

  /** Client IP: the socket peer, unless that peer is a configured trusted proxy. */
  function clientIp(req: http.IncomingMessage) {
    const peer = normalizeIp(req.socket.remoteAddress);
    if (!config.trustedProxies.includes(peer)) return peer || "unknown";
    const chain = String(req.headers["x-forwarded-for"] ?? "")
      .split(",")
      .map((s) => normalizeIp(s.trim()))
      .filter(Boolean);
    for (let i = chain.length - 1; i >= 0; i--) if (!config.trustedProxies.includes(chain[i])) return chain[i];
    return peer;
  }

  function sendError(res: http.ServerResponse, kind: GatewayErrorKind, close = false) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const page = errorPage(kind);
    res.writeHead(page.status, {
      ...GATEWAY_PAGE_HEADERS,
      "x-localians-gateway-error": kind,
      ...(close ? { connection: "close" } : {}),
    });
    res.end(page.html);
  }

  // ------------------------------------------------------- preview access (passwords)

  /** null = allowed; otherwise why not. Applies to every HTTP request and WebSocket upgrade. */
  function accessBlock(req: http.IncomingMessage, tunnel: Tunnel): "unavailable" | "protected" | null {
    if (!tunnel.policy) return "unavailable"; // not confirmed by the control plane yet: fail closed
    if (tunnel.policy.mode === "public") return null;
    return verifyAccess(accessKey, readCookie(req.headers.cookie, accessCookie), tunnel.label, tunnel.policy) ? null : "protected";
  }

  function sendLogin(req: http.IncomingMessage, res: http.ServerResponse, status: number, message: LoginMessage = "none", next = req.url ?? "/") {
    const wantsHtml = (req.method === "GET" || req.method === "HEAD" || req.method === "POST") && /text\/html|\*\/\*/.test(String(req.headers.accept ?? "text/html"));
    if (!wantsHtml) return sendError(res, "protected");
    const html = loginPage(safeNext(next), message);
    res.writeHead(status, { ...GATEWAY_PAGE_HEADERS, "x-localians-gateway-error": "protected", "content-length": Buffer.byteLength(html) });
    res.end(req.method === "HEAD" ? undefined : html);
  }

  function redirect(res: http.ServerResponse, location: string, cookie?: string) {
    res.writeHead(303, { location, "cache-control": "no-store", ...(cookie ? { "set-cookie": cookie } : {}) });
    res.end();
  }

  function readForm(req: http.IncomingMessage, limit = 4096) {
    return new Promise<URLSearchParams | null>((resolve) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => {
        body += chunk;
        if (body.length > limit) {
          resolve(null);
          req.destroy();
        }
      });
      req.on("end", () => resolve(new URLSearchParams(body)));
      req.on("error", () => resolve(null));
    });
  }

  /** `/__localians/access` (sign in) and `/__localians/logout` on preview hosts. Never forwarded to the app. */
  async function handleAccessRoute(req: http.IncomingMessage, res: http.ServerResponse, tunnel: Tunnel, path: string) {
    if (path === ACCESS_PATHS.logout) return redirect(res, "/", clearCookieHeader(accessCookie, secureCookies));
    if (req.method !== "POST") {
      if (tunnel.policy?.mode === "password") return sendLogin(req, res, 401, "none", "/");
      return redirect(res, "/");
    }
    const form = await readForm(req);
    const next = safeNext(form?.get("next"));
    if (!form) return sendError(res, "too-large", true);
    if (!tunnel.policy) return sendLogin(req, res, 503, "unavailable", next);
    if (tunnel.policy.mode === "public") return redirect(res, next);
    const ip = clientIp(req);
    if (!loginRate.take(`${tunnel.label}:${ip}`)) return sendLogin(req, res, 429, "rate-limited", next);

    const verdict = await checkAccess({ sessionId: tunnel.sessionId, password: form.get("password") ?? "", clientIp: ip });
    if (!verdict) return sendLogin(req, res, 503, "unavailable", next);
    if (verdict.policy) tunnel.policy = verdict.policy;
    if (verdict.ok) {
      const { value, maxAge } = signAccess(accessKey, tunnel.label, verdict.policy);
      log("info", "preview access granted", { label: tunnel.label });
      return redirect(res, next, setCookieHeader(accessCookie, value, maxAge, secureCookies));
    }
    if (verdict.error === "not_protected") return redirect(res, next);
    if (verdict.error === "ended") return sendError(res, "not-found");
    log("info", "preview access denied", { label: tunnel.label, reason: verdict.error });
    return sendLogin(req, res, verdict.error === "rate_limited" ? 429 : 401, verdict.error === "rate_limited" ? "rate-limited" : "invalid", next);
  }

  function applyPolicy(sessionId: string, policy: AccessPolicy | undefined) {
    if (!policy) return 0;
    let applied = 0;
    for (const tunnel of tunnels.values()) {
      if (tunnel.sessionId !== sessionId) continue;
      tunnel.policy = policy;
      applied++;
    }
    return applied;
  }

  function writeRawError(socket: Duplex, kind: GatewayErrorKind) {
    const page = errorPage(kind);
    socket.end(
      `HTTP/1.1 ${page.status} ${http.STATUS_CODES[page.status]}\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(page.html)}\r\n\r\n${page.html}`,
    );
  }

  function counter(onBytes: (n: number) => void, limit: number) {
    let total = 0;
    return new Transform({
      transform(chunk: Buffer, _enc, cb) {
        total += chunk.length;
        onBytes(chunk.length);
        if (total > limit) cb(new Error("size limit exceeded"));
        else cb(null, chunk);
      },
    });
  }

  /** Common admission checks for a public request on a preview host. */
  function admit(req: http.IncomingMessage, label: string): { tunnel: Tunnel } | { error: GatewayErrorKind } {
    if (!ipRate.take(clientIp(req))) return { error: "rate-limited" };
    const tunnel = tunnels.get(label);
    if (!tunnel || tunnel.closed) return { error: "not-found" };
    if (!tunnelRate.take(label)) return { error: "rate-limited" };
    if (tunnel.activeStreams >= config.limits.maxStreamsPerTunnel) return { error: "busy" };
    return { tunnel };
  }

  // ------------------------------------------------------- public HTTP requests

  function onRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    // Only origin-form targets: refusing absolute-form ("GET http://other/") prevents open-proxy use.
    if (!req.url || !req.url.startsWith("/")) return sendError(res, "bad-request", true);
    const hostname = parseHostname(req.headers.host);
    if (!hostname) return sendError(res, "bad-request", true);
    if (hostname === config.tunnelHost) return sendError(res, "not-found");
    const label = labelFor(hostname);
    if (!label) return sendError(res, "not-found");

    const admitted = admit(req, label);
    if ("error" in admitted) return sendError(res, admitted.error);
    const { tunnel } = admitted;

    const path = req.url.split("?")[0];
    if (path === ACCESS_PATHS.login || path === ACCESS_PATHS.logout) {
      void handleAccessRoute(req, res, tunnel, path).catch(() => sendError(res, "bad-gateway"));
      return;
    }
    const blocked = accessBlock(req, tunnel);
    if (blocked === "unavailable") return sendError(res, "unavailable");
    if (blocked === "protected") return sendLogin(req, res, 401);

    const declared = Number(req.headers["content-length"] ?? 0);
    if (declared > config.limits.maxRequestBodyBytes) return sendError(res, "too-large", true);

    forwardHttp(req, res, tunnel, hostname);
  }

  function forwardHttp(req: http.IncomingMessage, res: http.ServerResponse, tunnel: Tunnel, hostname: string) {
    const started = Date.now();
    const headers = sanitizeRequestHeaders(req.headers, { clientIp: clientIp(req), host: hostname, proto: config.publicProto });
    headers[H.originalHost] = hostname;

    let stream: http2.ClientHttp2Stream;
    try {
      stream = tunnel.session.request({ ":method": req.method ?? "GET", ":path": req.url!, ...headers }, { endStream: false });
    } catch {
      return sendError(res, "bad-gateway");
    }
    tunnel.activeStreams++;
    tunnel.totals.requests++;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      tunnel.activeStreams--;
      clearTimeout(responseTimer);
      log("info", "request", {
        label: tunnel.label,
        method: req.method,
        path: redactPath(req.url ?? ""),
        status: res.statusCode,
        ms: Date.now() - started,
      });
    };

    const responseTimer = setTimeout(() => {
      stream.close(NGHTTP2_CANCEL);
      sendError(res, "local-timeout");
    }, config.limits.responseTimeoutMs);
    stream.setTimeout(config.limits.idleTimeoutMs, () => {
      stream.close(NGHTTP2_CANCEL);
      sendError(res, "local-timeout");
    });

    const body = counter((n) => {
      tunnel.totals.bytesIn += n;
    }, config.limits.maxRequestBodyBytes);
    body.on("error", () => {
      stream.close(NGHTTP2_CANCEL);
      sendError(res, "too-large", true);
    });
    req.pipe(body).pipe(stream);

    // Visitor went away: cancel the stream so the CLI aborts the local request.
    res.on("close", () => {
      if (!res.writableFinished) stream.close(NGHTTP2_CANCEL);
      finish();
    });

    stream.on("response", (h) => {
      clearTimeout(responseTimer);
      const failure = h[H.error];
      if (failure) {
        stream.resume();
        return sendError(res, failure === "local-timeout" ? "local-timeout" : "local-unreachable");
      }
      const status = Number(h[":status"]) || 502;
      res.writeHead(status, sanitizeResponseHeaders(h));
      const out = counter((n) => {
        tunnel.totals.bytesOut += n;
      }, config.limits.maxResponseBytes);
      out.on("error", () => {
        stream.close(NGHTTP2_CANCEL);
        res.destroy();
      });
      stream.pipe(out).pipe(res);
    });
    stream.on("error", () => sendError(res, "bad-gateway"));
  }

  // ------------------------------------------------------------- upgrades

  async function onUpgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer) {
    socket.on("error", () => socket.destroy());
    const hostname = parseHostname(req.headers.host);
    if (!hostname || !req.url?.startsWith("/")) return writeRawError(socket, "bad-request");
    if (hostname === config.tunnelHost) return acceptTunnel(req, socket, head);
    const label = labelFor(hostname);
    if (!label) return writeRawError(socket, "not-found");
    return forwardWebSocket(req, socket, head, label, hostname);
  }

  /** CLI → gateway: authenticate the connect token, then run HTTP/2 over the socket. */
  async function acceptTunnel(req: http.IncomingMessage, socket: Duplex, head: Buffer) {
    const reject = (status: number, error: string) => {
      const body = JSON.stringify({ error });
      socket.end(`HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: ${body.length}\r\n\r\n${body}`);
    };
    if (req.url !== CONNECT_PATH) return reject(404, "not_found");
    if (String(req.headers.upgrade ?? "").toLowerCase() !== PROTOCOL_UPGRADE) return reject(400, "unsupported_protocol");
    if (tunnels.size >= config.limits.maxTunnels) return reject(503, "gateway_full");

    const token = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization ?? ""))?.[1];
    if (!token) return reject(401, "missing_token");

    let claims: { sid: string; sub: string; label: string; jti: string; exp: number };
    try {
      const { payload } = await jwtVerify(token, config.tokenSecret, {
        issuer: CONNECT_TOKEN_ISSUER,
        audience: CONNECT_TOKEN_AUDIENCE,
        algorithms: ["HS256"],
      });
      const { sid, sub, label, jti, exp } = payload as Record<string, unknown>;
      if (typeof sid !== "string" || typeof sub !== "string" || typeof label !== "string" || !LABEL_PATTERN.test(label) || typeof jti !== "string" || typeof exp !== "number") {
        return reject(401, "invalid_token");
      }
      claims = { sid, sub, label, jti, exp };
    } catch {
      return reject(401, "invalid_token");
    }
    if (!replay.use(claims.jti, claims.exp * 1000)) return reject(401, "token_reused");
    // Stopped from the dashboard: a connect token minted before the stop must not revive the session.
    if (isBlocked(claims.sid)) return reject(410, "session_ended");

    // HTTP/2 takes over the socket's native handle, so the 101 must be fully written first:
    // handing over a TLS socket mid-write aborts the process (is_write_in_progress assertion).
    const written = await new Promise<boolean>((resolve) =>
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: ${PROTOCOL_UPGRADE}\r\n\r\n`, (err) => resolve(!err)),
    );
    if (!written || socket.destroyed) return;
    if (head.length) socket.unshift(head);
    if ("setNoDelay" in socket && typeof socket.setNoDelay === "function") socket.setNoDelay(true);
    if ("setTimeout" in socket && typeof socket.setTimeout === "function") socket.setTimeout(0);

    const session = http2.connect("http://localians-agent", {
      createConnection: () => socket,
      peerMaxConcurrentStreams: config.limits.maxStreamsPerTunnel,
      settings: { enablePush: false, initialWindowSize: 1024 * 1024 },
    });
    session.on("error", (error) => log("warn", "tunnel session error", { label: claims.label, error: error.message }));

    const tunnel: Tunnel = {
      label: claims.label,
      sessionId: claims.sid,
      connectionId: randomBytes(12).toString("base64url"),
      userId: claims.sub,
      session,
      socket,
      connectedAt: Date.now(),
      activeStreams: 0,
      totals: { bytesIn: 0, bytesOut: 0, requests: 0 },
      policy: null,
      closed: false,
    };
    session.on("close", () => closeTunnel(tunnel, "connection closed"));
    socket.on("close", () => closeTunnel(tunnel, "socket closed"));

    // The control plane confirms the session before any traffic is routed to it, so a session
    // that was stopped or revoked can't serve even briefly. If the control plane is unreachable
    // the tunnel is registered (availability) but serves 503 until a heartbeat delivers its access
    // policy, so a password-protected preview is never briefly public.
    const verdict = await deliver([{ type: "connected", sessionId: claims.sid, connectionId: tunnel.connectionId }]);
    const action = verdict?.sessions[claims.sid];
    if (action?.action === "terminate" || isBlocked(claims.sid)) {
      closeTunnel(tunnel, `rejected by control plane: ${action?.reason ?? "terminated"}`);
      return;
    }
    if (tunnel.closed) return;
    tunnel.policy = action?.policy ?? null;

    // A reconnect replaces a half-dead previous connection for the same session.
    const previous = tunnels.get(claims.label);
    tunnels.set(claims.label, tunnel);
    if (previous) closeTunnel(previous, "replaced by reconnect");
    log("info", "tunnel connected", { label: claims.label, sessionId: claims.sid });
  }

  /** Public browser WebSocket → tunnel stream → local server, raw bytes after the 101. */
  function forwardWebSocket(req: http.IncomingMessage, socket: Duplex, head: Buffer, label: string, hostname: string) {
    if (String(req.headers.upgrade ?? "").toLowerCase() !== "websocket") return writeRawError(socket, "bad-request");
    const admitted = admit(req, label);
    if ("error" in admitted) return writeRawError(socket, admitted.error);
    const { tunnel } = admitted;
    // WebSockets need the same access as pages: a protected preview's socket needs a valid visitor cookie.
    const blocked = accessBlock(req, tunnel);
    if (blocked) return writeRawError(socket, blocked);

    const headers = sanitizeRequestHeaders(req.headers, { clientIp: clientIp(req), host: hostname, proto: config.publicProto });
    headers[H.originalHost] = hostname;
    headers[H.upgrade] = "websocket";

    let stream: http2.ClientHttp2Stream;
    try {
      stream = tunnel.session.request({ ":method": "GET", ":path": req.url!, ...headers }, { endStream: false });
    } catch {
      return writeRawError(socket, "bad-gateway");
    }
    tunnel.activeStreams++;
    tunnel.totals.requests++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      tunnel.activeStreams--;
      clearTimeout(timer);
      stream.close(NGHTTP2_CANCEL);
      socket.destroy();
    };
    const timer = setTimeout(() => writeRawError(socket, "local-timeout"), config.limits.responseTimeoutMs);
    socket.on("close", release);
    stream.on("close", release);
    stream.on("error", release);

    stream.on("response", (h) => {
      clearTimeout(timer);
      if (h[H.upstreamStatus] === "101") {
        const lines = ["HTTP/1.1 101 Switching Protocols", "Connection: Upgrade", "Upgrade: websocket"];
        for (const [k, v] of Object.entries(sanitizeResponseHeaders(h))) {
          for (const value of Array.isArray(v) ? v : [v]) if (!/[\r\n]/.test(value)) lines.push(`${k}: ${value}`);
        }
        socket.write(`${lines.join("\r\n")}\r\n\r\n`);
        if (head.length) stream.write(head);
        const up = counter((n) => {
          tunnel.totals.bytesIn += n;
        }, Number.MAX_SAFE_INTEGER);
        const down = counter((n) => {
          tunnel.totals.bytesOut += n;
        }, Number.MAX_SAFE_INTEGER);
        socket.pipe(up).pipe(stream);
        stream.pipe(down).pipe(socket);
        log("info", "websocket opened", { label, path: redactPath(req.url ?? "") });
        return;
      }
      if (h[H.error]) return writeRawError(socket, h[H.error] === "local-timeout" ? "local-timeout" : "local-unreachable");
      // The local server declined the upgrade: relay its plain HTTP response.
      const status = Number(h[":status"]) || 502;
      const lines = [`HTTP/1.1 ${status} ${http.STATUS_CODES[status] ?? ""}`, "Connection: close"];
      for (const [k, v] of Object.entries(sanitizeResponseHeaders(h))) {
        if (k === "content-length") continue;
        for (const value of Array.isArray(v) ? v : [v]) if (!/[\r\n]/.test(value)) lines.push(`${k}: ${value}`);
      }
      socket.write(`${lines.join("\r\n")}\r\n\r\n`);
      stream.pipe(socket);
    });
  }

  // ------------------------------------------------------------ lifecycle

  function closeTunnel(tunnel: Tunnel, reason: string) {
    if (tunnel.closed) return;
    tunnel.closed = true;
    if (tunnels.get(tunnel.label) === tunnel) tunnels.delete(tunnel.label);
    if (!tunnel.session.destroyed) tunnel.session.destroy();
    tunnel.socket.destroy();
    log("info", "tunnel closed", { label: tunnel.label, sessionId: tunnel.sessionId, reason });
    // Always report the final counters, even for terminated tunnels, so no traffic goes unmetered.
    void deliver([{ type: "disconnected", sessionId: tunnel.sessionId, connectionId: tunnel.connectionId, ...tunnel.totals, reason }]);
  }

  async function heartbeat() {
    const live = [...tunnels.values()].filter((t) => !t.closed);
    // Liveness: an unanswered HTTP/2 PING closes the tunnel so visitors get an error, not a hang.
    for (const tunnel of live) {
      const timeout = setTimeout(() => closeTunnel(tunnel, "ping timeout"), config.pingTimeoutMs);
      try {
        tunnel.session.ping((err) => {
          clearTimeout(timeout);
          if (err) closeTunnel(tunnel, "ping failed");
        });
      } catch {
        clearTimeout(timeout);
        closeTunnel(tunnel, "ping failed");
      }
    }
    const events: GatewayEvent[] = live.map((t) => ({ type: "heartbeat", sessionId: t.sessionId, connectionId: t.connectionId, ...t.totals }));
    // Control plane unreachable: keep serving; the next heartbeat carries the same cumulative totals.
    const verdict = await deliver(events);
    if (!verdict) return;
    for (const t of live) {
      const action = verdict.sessions[t.sessionId];
      if (action?.action === "terminate") closeTunnel(t, `terminated by control plane: ${action.reason ?? ""}`);
      else if (action?.policy) t.policy = action.policy;
    }
  }
  const heartbeatTimer = setInterval(() => void heartbeat(), config.heartbeatIntervalMs);
  heartbeatTimer.unref();

  /** Stops routing a session now and refuses its reconnects (dashboard "Stop preview"). */
  function terminate(sessionId: string, reason = "stopped from the dashboard"): GatewayTerminateResponse {
    block(sessionId);
    let terminated = 0;
    for (const tunnel of [...tunnels.values()]) {
      if (tunnel.sessionId !== sessionId) continue;
      closeTunnel(tunnel, reason);
      terminated++;
    }
    const routing = [...tunnels.values()].some((t) => t.sessionId === sessionId);
    log("info", "session terminated", { sessionId, terminated });
    return { gatewayId: config.gatewayId, terminated, routing };
  }

  function listTunnels(): GatewayTunnelsResponse {
    return {
      gatewayId: config.gatewayId,
      tunnels: [...tunnels.values()]
        .filter((t) => !t.closed)
        .map((t) => ({ sessionId: t.sessionId, connectionId: t.connectionId, connectedAt: new Date(t.connectedAt).toISOString() })),
    };
  }

  function stats() {
    return {
      gatewayId: config.gatewayId,
      uptimeS: Math.round((Date.now() - startedAt) / 1000),
      tunnels: tunnels.size,
      activeStreams: [...tunnels.values()].reduce((n, t) => n + t.activeStreams, 0),
      totals: [...tunnels.values()].reduce(
        (acc, t) => ({ bytesIn: acc.bytesIn + t.totals.bytesIn, bytesOut: acc.bytesOut + t.totals.bytesOut, requests: acc.requests + t.totals.requests }),
        { bytesIn: 0, bytesOut: 0, requests: 0 },
      ),
    };
  }

  const digest = (value: string) => createHash("sha256").update(value).digest();
  const adminSecret = digest(config.controlPlane.apiSecret);
  function adminAuthorized(req: http.IncomingMessage) {
    const provided = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization ?? ""))?.[1];
    return Boolean(provided) && timingSafeEqual(digest(provided!), adminSecret);
  }

  // Private admin listener (loopback unless GATEWAY_ADMIN_HOST says otherwise): never reachable
  // through preview hosts. Health is open to the host; control routes need the shared secret.
  const admin = http.createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(body));
    };
    const url = req.url ?? "";
    if (req.method === "GET" && url === "/healthz") return send(200, { ok: true, gatewayId: config.gatewayId });
    if (req.method === "GET" && url === "/metrics") return send(200, stats());
    // Ready = able to reach the control plane (needed to admit new tunnels and check passwords).
    if (req.method === "GET" && url === "/readyz") {
      const ready = reportFailingSince === null || Date.now() - reportFailingSince < config.heartbeatIntervalMs * 3;
      return send(ready ? 200 : 503, { ready, gatewayId: config.gatewayId, controlPlane: reportFailingSince === null ? "ok" : "unreachable" });
    }
    const terminateMatch = /^\/v1\/sessions\/([A-Za-z0-9_-]{1,64})\/terminate$/.exec(url);
    const policyMatch = /^\/v1\/sessions\/([A-Za-z0-9_-]{1,64})\/policy$/.exec(url);
    if (url === "/v1/tunnels" || terminateMatch || policyMatch) {
      if (!adminAuthorized(req)) return send(401, { error: "unauthorized" });
      if (req.method === "GET" && url === "/v1/tunnels") return send(200, listTunnels());
      if (req.method === "POST" && terminateMatch) return send(200, terminate(terminateMatch[1]));
      if (req.method === "POST" && policyMatch) {
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk: string) => (body = (body + chunk).slice(0, 2048)));
        req.on("end", () => {
          const policy = parsePolicy(body);
          if (!policy) return send(400, { error: "invalid_policy" });
          const applied = applyPolicy(policyMatch[1], policy);
          log("info", "access policy updated", { sessionId: policyMatch[1], mode: policy.mode, applied });
          send(200, { applied });
        });
        return;
      }
      return send(405, { error: "method_not_allowed" });
    }
    send(404, { error: "not_found" });
  });

  return {
    server,
    stats,
    heartbeat,
    terminate,
    listTunnels,
    hasTunnel: (label: string) => tunnels.has(label),
    /** Drops one tunnel's connection (operator action; also simulates a network failure in tests). */
    disconnect(label: string, reason = "disconnected by operator") {
      const tunnel = tunnels.get(label);
      if (tunnel) closeTunnel(tunnel, reason);
      return Boolean(tunnel);
    },
    async listen() {
      await new Promise<void>((resolve) => server.listen(config.port, config.host, resolve));
      if (config.adminPort !== null) await new Promise<void>((resolve) => admin.listen(config.adminPort!, config.adminHost, resolve));
      const { port } = server.address() as AddressInfo;
      log("info", "gateway listening", { port, tls: Boolean(config.tls), previewDomain: config.previewDomain, tunnelHost: config.tunnelHost });
      return { port, adminPort: config.adminPort !== null ? (admin.address() as AddressInfo).port : null };
    },
    async close() {
      clearInterval(heartbeatTimer);
      for (const tunnel of [...tunnels.values()]) closeTunnel(tunnel, "gateway shutting down");
      server.closeAllConnections?.();
      await Promise.all([
        new Promise((resolve) => server.close(resolve)),
        config.adminPort !== null ? new Promise((resolve) => admin.close(resolve)) : Promise.resolve(),
      ]);
    },
  };
}

/** Validates an access policy pushed by the control plane. */
function parsePolicy(body: string): AccessPolicy | null {
  try {
    const p = JSON.parse(body) as Partial<AccessPolicy>;
    if ((p.mode !== "public" && p.mode !== "password") || !Number.isInteger(p.version) || !Number.isInteger(p.ttlS) || (p.ttlS ?? 0) <= 0) return null;
    return { mode: p.mode, version: p.version as number, ttlS: p.ttlS as number };
  } catch {
    return null;
  }
}
