/**
 * Tunnel performance measurement (opt-in): `BENCH=1 npx vitest run`.
 * Real gateway + agent in one process against a local HTTP server on this machine,
 * so it measures tunnel overhead, not internet latency.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { SignJWT } from "jose";
import { afterAll, beforeAll, it } from "vitest";
import { startAgent } from "@tunnel/cli/agent";
import { createGateway } from "@tunnel/gateway/gateway";
import { CONNECT_TOKEN_AUDIENCE, CONNECT_TOKEN_ISSUER } from "@tunnel/shared/protocol";

const SECRET = "bench-secret-bench-secret-bench-secret-1234";
const LABEL = "benchbenchbe";
let gateway: ReturnType<typeof createGateway>;
let agent: ReturnType<typeof startAgent>;
let local: http.Server;
let gwPort = 0;
let localPort = 0;

beforeAll(async () => {
  local = http.createServer((req, res) => {
    if (req.url?.startsWith("/big")) {
      const size = 50 * 1024 * 1024;
      res.writeHead(200, { "content-length": size });
      const chunk = Buffer.alloc(64 * 1024, 1);
      let sent = 0;
      const pump = () => {
        while (sent < size) {
          sent += chunk.length;
          if (!res.write(chunk)) return res.once("drain", pump);
        }
        res.end();
      };
      return pump();
    }
    req.resume();
    req.on("end", () => res.end("ok"));
  });
  await new Promise<void>((r) => local.listen(0, "127.0.0.1", r));
  localPort = (local.address() as AddressInfo).port;

  gateway = createGateway(
    {
      host: "127.0.0.1",
      port: 0,
      tls: null,
      previewDomain: "bench.test",
      tunnelHost: "127.0.0.1",
      publicProto: "http",
      tokenSecret: new TextEncoder().encode(SECRET),
      controlPlane: { url: "http://unused", apiSecret: "x" },
      gatewayId: "bench",
      adminPort: 0,
      adminHost: "127.0.0.1",
      trustedProxies: [],
      limits: {
        maxTunnels: 10,
        maxStreamsPerTunnel: 500,
        maxRequestBodyBytes: 100 * 1024 * 1024,
        maxResponseBytes: 1024 * 1024 * 1024,
        responseTimeoutMs: 30_000,
        idleTimeoutMs: 30_000,
        requestsPerSecondPerTunnel: 1e9,
        requestsPerSecondPerIp: 1e9,
      },
      heartbeatIntervalMs: 3_600_000,
      pingTimeoutMs: 10_000,
    },
    // A public policy for every session: without one the gateway fails closed (503).
    { log: () => {}, report: async (events) => ({ sessions: Object.fromEntries(events.map((e) => [e.sessionId, { action: "continue" as const, policy: { mode: "public" as const, version: 1, ttlS: 3600 } }])) }) },
  );
  gwPort = (await gateway.listen()).port;

  agent = startAgent({
    gatewayUrl: `http://127.0.0.1:${gwPort}`,
    localPort,
    localAddress: "127.0.0.1",
    getConnectToken: () =>
      new SignJWT({ sid: "bench", cid: "c", label: LABEL, port: localPort })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("u")
        .setIssuer(CONNECT_TOKEN_ISSUER)
        .setAudience(CONNECT_TOKEN_AUDIENCE)
        .setExpirationTime("60s")
        .setJti(`j${Math.random()}`)
        .sign(new TextEncoder().encode(SECRET)),
  });
  while (!gateway.hasTunnel(LABEL)) await new Promise((r) => setTimeout(r, 20));
});

afterAll(async () => {
  agent?.stop();
  await gateway?.close();
  await new Promise((r) => local.close(r));
});

const keepAlive = new http.Agent({ keepAlive: true, maxSockets: 64 });

function get(port: number, host: string, path: string) {
  return new Promise<number>((resolve, reject) => {
    let bytes = 0;
    http
      .get({ host: "127.0.0.1", port, path, headers: { host }, agent: keepAlive }, (res) => {
        res.on("data", (c: Buffer) => (bytes += c.length));
        res.on("end", () => resolve(bytes));
      })
      .on("error", reject);
  });
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

async function latency(port: number, host: string, n: number) {
  const samples: number[] = [];
  for (let i = 0; i < 50; i++) await get(port, host, "/"); // warm-up
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    await get(port, host, "/");
    samples.push(performance.now() - t);
  }
  samples.sort((a, b) => a - b);
  return { p50: pct(samples, 50).toFixed(2), p95: pct(samples, 95).toFixed(2), p99: pct(samples, 99).toFixed(2) };
}

async function throughput(port: number, host: string, concurrency: number, total: number) {
  const t = performance.now();
  let done = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (done < total) {
        done++;
        await get(port, host, "/");
      }
    }),
  );
  return Math.round(total / ((performance.now() - t) / 1000));
}

async function download(port: number, host: string) {
  const t = performance.now();
  const bytes = await get(port, host, "/big");
  return ((bytes / 1024 / 1024) / ((performance.now() - t) / 1000)).toFixed(0);
}

it("measures tunnel overhead", async () => {
  const tunnelHost = `${LABEL}.bench.test`;
  const direct = { latency: await latency(localPort, "localhost", 1000), rps: await throughput(localPort, "localhost", 32, 5000), mbps: await download(localPort, "localhost") };
  const tunnel = { latency: await latency(gwPort, tunnelHost, 1000), rps: await throughput(gwPort, tunnelHost, 32, 5000), mbps: await download(gwPort, tunnelHost) };
  const memMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(0);
  const table = [
    "",
    "                         direct        via tunnel",
    `latency p50 (ms)         ${direct.latency.p50.padEnd(14)}${tunnel.latency.p50}`,
    `latency p95 (ms)         ${direct.latency.p95.padEnd(14)}${tunnel.latency.p95}`,
    `latency p99 (ms)         ${direct.latency.p99.padEnd(14)}${tunnel.latency.p99}`,
    `requests/s (32 conc.)    ${String(direct.rps).padEnd(14)}${tunnel.rps}`,
    `50 MB download (MB/s)    ${direct.mbps.padEnd(14)}${tunnel.mbps}`,
    `process RSS after run    ${memMb} MB`,
    "",
  ].join("\n");
  process.stderr.write(table);
}, 300_000);
