import http from "node:http";
import http2 from "node:http2";
import https from "node:https";
import { isIP } from "node:net";
import type { Duplex } from "node:stream";
import { backoffDelay } from "../shared/backoff";
import { sanitizeResponseHeaders } from "../shared/headers";
import { CONNECT_PATH, H, PROTOCOL_UPGRADE, type TunnelErrorCode } from "../shared/protocol";
import { LOOPBACK_ADDRESSES, type LoopbackAddress } from "./local";

const { NGHTTP2_CANCEL } = http2.constants;

export type AgentState = "connecting" | "connected" | "reconnecting" | "stopped";

/** Why the agent stopped for good (no more reconnect attempts). */
export type StopReason = "user" | "auth" | "ended" | "fatal";

export class ConnectError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string,
  ) {
    super(message);
  }
}

export type AgentOptions = {
  gatewayUrl: string;
  localPort: number;
  localAddress: LoopbackAddress;
  /** `rewrite` (default) sends Host: localhost:<port>, which dev servers expect; `preserve` sends the public host. */
  hostHeader?: "rewrite" | "preserve";
  /**
   * Returns a fresh single-use connect token. Throw a ConnectError with status
   * 401/403/404/410 to stop reconnecting (revoked credentials / ended session).
   */
  getConnectToken: (attempt: number) => Promise<string>;
  onState?: (state: AgentState, info: { attempt?: number; delayMs?: number; reason?: string; stopReason?: StopReason }) => void;
  onRequest?: (entry: { method: string; path: string; status: number; ms: number; websocket?: boolean }) => void;
  userAgent?: string;
  pingIntervalMs?: number;
};

/** Statuses that mean "stop trying" rather than "retry later". */
const FATAL_STATUSES = new Set([401, 403, 404, 410]);

export function startAgent(options: AgentOptions) {
  const port = options.localPort;
  let address: LoopbackAddress = options.localAddress;
  const hostHeader = options.hostHeader ?? "rewrite";
  const localAgent = new http.Agent({ keepAlive: true, maxSockets: 64 });

  let state: AgentState = "connecting";
  let current: http2.ServerHttp2Session | null = null;
  let stopped = false;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let pingTimer: NodeJS.Timeout | null = null;
  let resolveDone!: (reason: StopReason) => void;
  const done = new Promise<StopReason>((r) => (resolveDone = r));

  const setState = (next: AgentState, info: Parameters<NonNullable<AgentOptions["onState"]>>[1] = {}) => {
    state = next;
    options.onState?.(next, info);
  };

  const server = http2.createServer({ settings: { enablePush: false, maxConcurrentStreams: 256, initialWindowSize: 1024 * 1024 } });
  server.on("stream", (stream, headers) => handleStream(stream as http2.ServerHttp2Stream, headers));
  server.on("session", (session) => {
    session.on("error", () => {});
  });

  // ------------------------------------------------------------- forwarding

  function classify(error: NodeJS.ErrnoException): TunnelErrorCode {
    if (error.code === "ECONNREFUSED" || error.code === "ECONNRESET" || error.code === "EHOSTUNREACH") return "local-unreachable";
    if (error.code === "ETIMEDOUT") return "local-timeout";
    return "local-error";
  }

  function localHeaders(headers: http2.IncomingHttpHeaders, upgrade: boolean) {
    const out: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (value === undefined || key.startsWith(":") || key.startsWith("x-localians-")) continue;
      out[key] = value as string | string[];
    }
    const publicHost = String(headers[H.originalHost] ?? "");
    out.host = hostHeader === "preserve" && publicHost ? publicHost : `localhost:${port}`;
    if (upgrade) {
      out.connection = "Upgrade";
      out.upgrade = "websocket";
    }
    return out;
  }

  function handleStream(stream: http2.ServerHttp2Stream, headers: http2.IncomingHttpHeaders) {
    const started = Date.now();
    const method = String(headers[":method"] ?? "GET");
    const path = String(headers[":path"] ?? "/");
    const upgrade = headers[H.upgrade] === "websocket";
    let triedAlternate = false;
    stream.on("error", () => {});

    const send = (target: LoopbackAddress) => {
      // The target is fixed by the developer's command line — never derived from the request.
      const req = http.request({
        host: target,
        port,
        method,
        path,
        headers: localHeaders(headers, upgrade),
        agent: upgrade ? false : localAgent,
      });

      req.on("response", (res) => {
        if (stream.destroyed) return res.destroy();
        stream.respond({ ":status": res.statusCode ?? 502, ...sanitizeResponseHeaders(res.headers) });
        res.pipe(stream);
        res.on("end", () => options.onRequest?.({ method, path, status: res.statusCode ?? 0, ms: Date.now() - started }));
        res.on("error", () => stream.close(NGHTTP2_CANCEL));
      });

      req.on("upgrade", (res, socket: Duplex, head) => {
        if (stream.destroyed) return socket.destroy();
        stream.respond({ ":status": 200, [H.upstreamStatus]: "101", ...sanitizeResponseHeaders(res.headers) });
        if (head.length) stream.write(head);
        socket.pipe(stream);
        stream.pipe(socket);
        const end = () => {
          socket.destroy();
          if (!stream.closed) stream.close();
        };
        socket.on("close", end);
        socket.on("error", end);
        stream.on("close", end);
        options.onRequest?.({ method, path, status: 101, ms: Date.now() - started, websocket: true });
      });

      req.on("error", (error: NodeJS.ErrnoException) => {
        // The dev server may have restarted on the other loopback family (IPv4 ⇄ IPv6).
        if (!triedAlternate && error.code === "ECONNREFUSED" && !stream.headersSent) {
          triedAlternate = true;
          const other = LOOPBACK_ADDRESSES.find((a) => a !== target)!;
          address = other;
          return send(other);
        }
        if (stream.destroyed) return;
        if (!stream.headersSent) {
          const code = classify(error);
          stream.respond({ ":status": 502, [H.error]: code }, { endStream: true });
          options.onRequest?.({ method, path, status: 502, ms: Date.now() - started });
        } else {
          stream.close(NGHTTP2_CANCEL);
        }
      });

      // Visitor cancelled (or the tunnel dropped): abort the local request too.
      stream.on("close", () => {
        if (!req.destroyed && !req.writableEnded) req.destroy();
      });

      if (upgrade) req.end();
      else stream.pipe(req);
    };

    send(address);
  }

  // ------------------------------------------------------------- connection

  function connectOnce(token: string) {
    return new Promise<http2.ServerHttp2Session>((resolve, reject) => {
      const url = new URL(CONNECT_PATH, options.gatewayUrl);
      const mod = url.protocol === "https:" ? https : http;
      const req = mod.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname,
        method: "GET",
        // SNI must be a hostname (RFC 6066), so omit it when dialling an IP address.
        servername: url.protocol === "https:" && !isIP(url.hostname) ? url.hostname : undefined,
        headers: {
          connection: "Upgrade",
          upgrade: PROTOCOL_UPGRADE,
          authorization: `Bearer ${token}`,
          "user-agent": options.userAgent ?? "localians-cli",
        },
        timeout: 15_000,
      });
      req.on("timeout", () => req.destroy(new ConnectError("Timed out connecting to the Localians gateway.", null, "timeout")));
      req.on("error", (error) => reject(error instanceof ConnectError ? error : new ConnectError(error.message, null, (error as NodeJS.ErrnoException).code ?? "network")));
      req.on("response", (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body = (body + c).slice(0, 2000)));
        res.on("end", () => {
          let code = "rejected";
          try {
            code = (JSON.parse(body) as { error?: string }).error ?? code;
          } catch {}
          reject(new ConnectError(`Gateway refused the tunnel (HTTP ${res.statusCode}, ${code}).`, res.statusCode ?? null, code));
        });
      });
      req.on("upgrade", (_res, socket, head) => {
        // Errors on the raw socket surface as a closed HTTP/2 session (→ reconnect), never a crash.
        socket.on("error", () => socket.destroy());
        if (head.length) socket.unshift(head);
        socket.setNoDelay?.(true);
        socket.setKeepAlive?.(true, 20_000);
        // HTTP/2 was negotiated by the Upgrade handshake rather than TLS ALPN. Node's HTTP/2
        // server treats a TLS socket without ALPN "h2" as an HTTP/1.1 fallback and hangs up,
        // so record the protocol that is actually in use.
        if ("alpnProtocol" in socket) (socket as { alpnProtocol: string | false }).alpnProtocol = "h2";
        server.once("session", (session) => resolve(session));
        server.emit("connection", socket);
      });
      req.end();
    });
  }

  async function run(attempt: number) {
    if (stopped) return;
    let token: string;
    try {
      token = await options.getConnectToken(attempt);
    } catch (error) {
      if (error instanceof ConnectError && error.status && FATAL_STATUSES.has(error.status)) {
        return stop(error.status === 410 ? "ended" : "auth", error.message);
      }
      return scheduleReconnect(attempt, error instanceof Error ? error.message : "could not reach Localians");
    }
    try {
      const session = await connectOnce(token);
      if (stopped) {
        session.destroy();
        return;
      }
      current = session;
      setState("connected", { attempt });
      session.on("close", () => {
        if (current === session) current = null;
        stopPing();
        if (!stopped) scheduleReconnect(0, "connection lost");
      });
      startPing(session);
    } catch (error) {
      const status = error instanceof ConnectError ? error.status : null;
      // The gateway refuses sessions that were stopped (e.g. from the dashboard): don't retry.
      if (status === 410) return stop("ended", "This preview was stopped. Run `localians share` again for a new link.");
      // A rejected connect token gets one fresh token next attempt; repeated 401s from the API stop us above.
      return scheduleReconnect(attempt, error instanceof Error ? error.message : "connection failed", status === 503 ? 5000 : undefined);
    }
  }

  function scheduleReconnect(attempt: number, reason: string, minDelay?: number) {
    if (stopped) return;
    const delayMs = Math.max(minDelay ?? 0, backoffDelay(attempt));
    setState("reconnecting", { attempt: attempt + 1, delayMs, reason });
    reconnectTimer = setTimeout(() => void run(attempt + 1), delayMs);
  }

  function startPing(session: http2.ServerHttp2Session) {
    stopPing();
    pingTimer = setInterval(() => {
      const timeout = setTimeout(() => session.destroy(), 10_000);
      try {
        session.ping((err) => {
          clearTimeout(timeout);
          if (err) session.destroy();
        });
      } catch {
        clearTimeout(timeout);
        session.destroy();
      }
    }, options.pingIntervalMs ?? 25_000);
    pingTimer.unref();
  }

  function stopPing() {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
  }

  function stop(reason: StopReason, message?: string) {
    if (stopped) return;
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    stopPing();
    if (current && !current.destroyed) {
      current.close();
      setTimeout(() => current?.destroy(), 1500).unref();
    }
    localAgent.destroy();
    setState("stopped", { stopReason: reason, reason: message });
    resolveDone(reason);
  }

  setState("connecting");
  void run(0);

  return {
    get state() {
      return state;
    },
    get localAddress() {
      return address;
    },
    /** Resolves when the agent stops for good. */
    done,
    stop: () => stop("user"),
  };
}
