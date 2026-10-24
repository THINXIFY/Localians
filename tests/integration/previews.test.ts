import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startAgent } from "@tunnel/cli/agent";
import { createApi } from "@tunnel/cli/api";
import type { Gateway } from "@tunnel/gateway/gateway";
import { projectInputSchema } from "@/lib/validation/project";
import { getAnalytics, resolveRange } from "@/server/analytics";
import { decideDeviceAuthorization } from "@/server/cli/device";
import { resetLiveTunnelCache } from "@/server/cli/gateway-control";
import { hourBucket } from "@/server/cli/lifecycle";
import { handleGatewayEvents } from "@/server/cli/tunnels";
import { prisma } from "@/server/db";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { collectChanges, newTracker } from "@/server/live-events";
import { effectiveStatus, getPreviewDetail, getPreviewSummary, getProjectPreviews, getRecentActivity, getShareStatus, listPreviews, stopPreview } from "@/server/previews";
import { createProject } from "@/server/projects";
import { getCurrentWorkspace } from "@/server/workspaces";
import { createVerifiedUser, signIn } from "./helpers";
import { GATEWAY_API_SECRET, PREVIEW_DOMAIN, publicRequest, startControlPlane, startLocalApp, startTestGateway, TUNNEL_TOKEN_SECRET, waitFor } from "./tunnel-harness";

const project = (name: string, port = "3000") => projectInputSchema.parse({ name, description: "", framework: "NEXTJS", defaultPort: port });

let controlPlane: Awaited<ReturnType<typeof startControlPlane>>;
let gateway: Gateway;
let gatewayPort: number;
let controlUrl: string;
let app: Awaited<ReturnType<typeof startLocalApp>>;

beforeAll(async () => {
  Object.assign(process.env, {
    TUNNEL_PREVIEW_DOMAIN: PREVIEW_DOMAIN,
    TUNNEL_TOKEN_SECRET,
    GATEWAY_API_SECRET,
    TUNNEL_PUBLIC_SCHEME: "http",
    CLI_DEVICE_RATE_LIMIT: "1000",
    DASHBOARD_EVENTS_POLL_MS: "250",
  });
  controlPlane = await startControlPlane();
  const started = await startTestGateway(controlPlane.url);
  gateway = started.gateway;
  gatewayPort = started.port;
  controlUrl = started.adminUrl;
  process.env.TUNNEL_GATEWAY_URL = `http://127.0.0.1:${gatewayPort}`;
  process.env.TUNNEL_PUBLIC_PORT = String(gatewayPort);
  process.env.GATEWAY_CONTROL_URL = controlUrl;
  app = await startLocalApp();
});

afterAll(async () => {
  await app?.close();
  await gateway?.close();
  await controlPlane?.close();
});

beforeEach(() => {
  process.env.GATEWAY_CONTROL_URL = controlUrl;
  resetLiveTunnelCache();
});

async function cliLogin(userId: string) {
  const api = createApi(controlPlane.url, null, "test");
  const start = await api.startDeviceLogin("CLI on test-machine (linux)");
  await decideDeviceAuthorization(userId, start.user_code, true);
  return (await api.pollDeviceLogin(start.device_code)).access_token;
}

/** `declaredPort`: the localhost port the CLI reports (one app per port per computer); traffic still goes to the test app. */
async function share(token: string, projectId: string, declaredPort = app.port) {
  const api = createApi(controlPlane.url, token, "test");
  const session = await api.createTunnel(projectId, declaredPort);
  let first: string | null = session.connectToken;
  const issued: string[] = [session.connectToken];
  let hold: Promise<void> | null = null;
  const agent = startAgent({
    gatewayUrl: session.gatewayUrl,
    localPort: app.port,
    localAddress: "127.0.0.1",
    getConnectToken: async () => {
      if (first) {
        const t = first;
        first = null;
        return t;
      }
      if (hold) await hold;
      const t = await api.connectToken(session.sessionId);
      issued.push(t);
      return t;
    },
  });
  /** Holds the CLI's next reconnect until the returned function is called. */
  const pauseReconnect = () => {
    let release!: () => void;
    hold = new Promise<void>((r) => (release = r));
    return () => {
      hold = null;
      release();
    };
  };
  await waitFor(() => agent.state === "connected" && gateway.hasTunnel(session.label), 10_000, "tunnel connected");
  await waitFor(async () => (await prisma.tunnelSession.findUniqueOrThrow({ where: { id: session.sessionId } })).status === "CONNECTED", 5000, "db connected");
  resetLiveTunnelCache();
  return { api, session, agent, issued, pauseReconnect, host: `${session.label}.${PREVIEW_DOMAIN}` };
}

/** A user with a project and a live share. */
async function sharingUser(name: string) {
  const { user, email } = await createVerifiedUser(name);
  const p = await createProject(user.id, project(`${name} App`));
  const token = await cliLogin(user.id);
  const t = await share(token, p.id);
  return { user, email, project: p, token, ...t };
}

describe("preview listing and authorization", () => {
  it("lists the user's own sessions with gateway-verified status, and hides them from other accounts", async () => {
    const a = await sharingUser("Lister");
    const { user: other } = await createVerifiedUser("Outsider");

    const mine = await listPreviews(a.user.id);
    expect(mine.items.map((p) => p.id)).toContain(a.session.sessionId);
    const row = mine.items.find((p) => p.id === a.session.sessionId)!;
    expect(row).toMatchObject({ status: "CONNECTED", statusSource: "gateway", active: true, canStop: true, localPort: app.port });
    expect(row.publicUrl).toBe(a.session.publicUrl);

    expect((await listPreviews(other.id)).items).toHaveLength(0);
    expect((await getPreviewSummary(other.id)).totalSessions).toBe(0);
    await expect(getPreviewDetail(other.id, a.session.sessionId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(stopPreview(other.id, a.session.sessionId)).rejects.toBeInstanceOf(NotFoundError);
    expect(gateway.hasTunnel(a.session.label)).toBe(true); // the failed stop changed nothing

    const detail = await getPreviewDetail(a.user.id, a.session.sessionId);
    expect(detail.preview.project.id).toBe(a.project.id);
    expect(detail.workspace.name).toMatch(/Workspace/);
    expect(detail.events.map((e) => e.type).reverse()).toEqual(["CREATED", "CONNECTED"]);
    expect(JSON.stringify(detail)).not.toMatch(/lcl_|eyJ|tokenHash/);
    a.agent.stop();
  });

  it("denies stopping to workspace members who didn't start the preview (owners may)", async () => {
    const owner = await sharingUser("Owner");
    const { user: member } = await createVerifiedUser("Member");
    const workspace = await getCurrentWorkspace(owner.user.id);
    // Make the owner's workspace the member's current (earliest) workspace.
    await prisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: member.id, role: "MEMBER", createdAt: new Date(0) } });

    const seen = await listPreviews(member.id);
    expect(seen.items.find((p) => p.id === owner.session.sessionId)?.canStop).toBe(false);
    await expect(stopPreview(member.id, owner.session.sessionId)).rejects.toBeInstanceOf(ForbiddenError);
    expect(gateway.hasTunnel(owner.session.label)).toBe(true);
    owner.agent.stop();
  });

  it("filters, searches, sorts and paginates with a cursor", async () => {
    const { user } = await createVerifiedUser("Filterer");
    const alpha = await createProject(user.id, project("Alpha Store"));
    const beta = await createProject(user.id, project("Beta Blog"));
    const base = Date.now() - 3600_000;
    for (let i = 0; i < 25; i++) {
      await prisma.tunnelSession.create({
        data: {
          projectId: i % 2 ? alpha.id : beta.id,
          userId: user.id,
          hostname: `hist${String.fromCharCode(97 + i)}aaaaaaa`,
          localPort: 3000 + i,
          status: "DISCONNECTED",
          connectedAt: new Date(base),
          disconnectedAt: new Date(base + i * 1000),
          lastActivityAt: new Date(base + i * 1000),
          expiresAt: new Date(base + 86_400_000),
        },
      });
    }
    const page1 = await listPreviews(user.id, { filter: "historical" });
    expect(page1.items).toHaveLength(20);
    expect(page1.nextCursor).not.toBeNull();
    const times = page1.items.map((p) => p.lastActivityAt.getTime());
    expect(times).toEqual([...times].sort((x, y) => y - x)); // latest activity first
    const page2 = await listPreviews(user.id, { filter: "historical", cursor: page1.nextCursor! });
    expect(page2.items).toHaveLength(5);
    expect(page2.nextCursor).toBeNull();
    expect(new Set([...page1.items, ...page2.items].map((p) => p.id)).size).toBe(25);

    expect((await listPreviews(user.id, { filter: "connected" })).items).toHaveLength(0);
    expect((await listPreviews(user.id, { filter: "offline" })).items).toHaveLength(0);
    expect((await listPreviews(user.id, { projectId: alpha.id })).items.every((p) => p.project.id === alpha.id)).toBe(true);
    expect((await listPreviews(user.id, { q: "beta" })).items.every((p) => p.project.name === "Beta Blog")).toBe(true);
    const one = page1.items[0];
    const byUrl = await listPreviews(user.id, { q: `http://${one.label}.${PREVIEW_DOMAIN}:${gatewayPort}/` });
    expect(byUrl.items.map((p) => p.id)).toEqual([one.id]);
    const newest = await listPreviews(user.id, { sort: "newest" });
    expect(newest.items).toHaveLength(20);
  });
});

describe("status accuracy", () => {
  it("doesn't trust a stale CONNECTED row: gateway routing table first, heartbeat freshness as fallback", () => {
    const row = { id: "s1", status: "CONNECTED" as const, connectedAt: new Date(), gatewayId: "gw-test", lastHeartbeatAt: new Date(Date.now() - 60_000) };
    expect(effectiveStatus(row, { gateways: new Map([["gw-test", new Set(["s1"])]]) }).status).toBe("CONNECTED");
    expect(effectiveStatus(row, { gateways: new Map([["gw-test", new Set<string>()]]) }).status).toBe("RECONNECTING");
    expect(effectiveStatus(row, null)).toEqual({ status: "RECONNECTING", source: "heartbeat" });
    expect(effectiveStatus({ ...row, lastHeartbeatAt: new Date() }, null)).toEqual({ status: "CONNECTED", source: "heartbeat" });
    expect(effectiveStatus({ ...row, status: "EXPIRED", connectedAt: null }, null).status).toBe("FAILED");
    expect(effectiveStatus({ ...row, status: "REVOKED" }, null).status).toBe("REVOKED");
  });

  it("shows a dropped tunnel as reconnecting, and connected again after the CLI reconnects", async () => {
    const t = await sharingUser("Dropper");
    const release = t.pauseReconnect();
    gateway.disconnect(t.session.label, "simulated network drop");
    await waitFor(async () => (await prisma.tunnelSession.findUniqueOrThrow({ where: { id: t.session.sessionId } })).status === "RECONNECTING", 5000, "db reconnecting");
    resetLiveTunnelCache();
    const during = (await listPreviews(t.user.id)).items[0];
    expect(during.status).toBe("RECONNECTING");
    expect((await listPreviews(t.user.id, { filter: "offline" })).items.map((p) => p.id)).toEqual([t.session.sessionId]);
    expect((await listPreviews(t.user.id, { filter: "connected" })).items).toHaveLength(0);
    release();
    await waitFor(() => gateway.hasTunnel(t.session.label), 15_000, "reconnected");
    await waitFor(async () => (await prisma.tunnelSession.findUniqueOrThrow({ where: { id: t.session.sessionId } })).status === "CONNECTED", 5000, "db connected");
    resetLiveTunnelCache();
    expect((await listPreviews(t.user.id)).items[0].status).toBe("CONNECTED");
    const types = (await getPreviewDetail(t.user.id, t.session.sessionId)).events.map((e) => e.type).reverse();
    expect(types).toEqual(["CREATED", "CONNECTED", "CONNECTION_LOST", "RECONNECTED"]);
    t.agent.stop();
  });
});

describe("stopping a preview from the dashboard", () => {
  it("closes the live tunnel on the gateway, stops routing, and records it", async () => {
    const t = await sharingUser("Stopper");
    expect((await publicRequest(gatewayPort, t.host, "/")).status).toBe(200);

    const result = await stopPreview(t.user.id, t.session.sessionId);
    expect(result).toEqual({ outcome: "stopped", gateway: "confirmed" });
    expect(gateway.hasTunnel(t.session.label)).toBe(false);
    const after = await publicRequest(gatewayPort, t.host, "/");
    expect(after.status).toBe(404);
    expect(after.body.toString()).not.toContain("Local app");

    const row = await prisma.tunnelSession.findUniqueOrThrow({ where: { id: t.session.sessionId } });
    expect(row.status).toBe("REVOKED");
    expect(row.endReason).toBe("Stopped from the dashboard");
    expect((await getPreviewDetail(t.user.id, t.session.sessionId)).events[0].type).toBe("STOPPED_FROM_DASHBOARD");

    // The CLI gives up instead of reconnecting, and the API refuses new connect tokens.
    expect(await t.agent.done).toBe("ended");
    await expect(t.api.connectToken(t.session.sessionId)).rejects.toMatchObject({ status: 410, message: expect.stringContaining("stopped from the Localians dashboard") });

    // Duplicate stop: idempotent, re-confirmed with the gateway.
    expect(await stopPreview(t.user.id, t.session.sessionId)).toEqual({ outcome: "already_ended", gateway: "confirmed" });
  });

  it("refuses reconnection with a connect token minted before the stop", async () => {
    const t = await sharingUser("Replayer");
    const spare = await t.api.connectToken(t.session.sessionId); // valid for 2 minutes, never used
    await stopPreview(t.user.id, t.session.sessionId);
    const agent = startAgent({ gatewayUrl: t.session.gatewayUrl, localPort: app.port, localAddress: "127.0.0.1", getConnectToken: async () => spare });
    expect(await agent.done).toBe("ended");
    expect(gateway.hasTunnel(t.session.label)).toBe(false);
    expect((await publicRequest(gatewayPort, t.host, "/")).status).toBe(404);
  });

  it("still revokes when the gateway is unreachable, and the gateway stops routing at its next check-in", async () => {
    const t = await sharingUser("Offline Gateway");
    process.env.GATEWAY_CONTROL_URL = "http://127.0.0.1:9"; // nothing listens here
    const result = await stopPreview(t.user.id, t.session.sessionId);
    expect(result).toEqual({ outcome: "stopped", gateway: "pending" });
    expect((await prisma.tunnelSession.findUniqueOrThrow({ where: { id: t.session.sessionId } })).status).toBe("REVOKED");

    await gateway.heartbeat(); // the control plane answers "terminate"
    await waitFor(() => !gateway.hasTunnel(t.session.label), 5000, "tunnel closed");
    expect((await publicRequest(gatewayPort, t.host, "/")).status).toBe(404);
    expect(await t.agent.done).toBe("ended");
  });

  it("treats a naturally ended session as already ended", async () => {
    const t = await sharingUser("Natural End");
    t.agent.stop();
    await t.agent.done;
    await t.api.closeTunnel(t.session.sessionId);
    expect(await stopPreview(t.user.id, t.session.sessionId)).toEqual({ outcome: "already_ended", gateway: "not_needed" });
    expect((await prisma.tunnelSession.findUniqueOrThrow({ where: { id: t.session.sessionId } })).status).toBe("DISCONNECTED");
  });
});

describe("gateway control API", () => {
  it("requires the shared secret, and isn't served on the public listener", async () => {
    const t = await sharingUser("Control Probe");
    for (const auth of [undefined, "Bearer wrong-secret", `Bearer ${TUNNEL_TOKEN_SECRET}`]) {
      const headers = auth ? { authorization: auth } : undefined;
      expect((await fetch(`${controlUrl}/v1/tunnels`, { headers })).status).toBe(401);
      expect((await fetch(`${controlUrl}/v1/sessions/${t.session.sessionId}/terminate`, { method: "POST", headers })).status).toBe(401);
    }
    expect(gateway.hasTunnel(t.session.label)).toBe(true);
    // Preview hosts and the tunnel host never expose it.
    for (const host of [t.host, "127.0.0.1"]) {
      const res = await publicRequest(gatewayPort, host, `/v1/sessions/${t.session.sessionId}/terminate`, { method: "POST", headers: { authorization: `Bearer ${GATEWAY_API_SECRET}` } });
      expect(res.body.toString()).not.toContain("terminated");
    }
    expect(gateway.hasTunnel(t.session.label)).toBe(true);
    const listed = (await (await fetch(`${controlUrl}/v1/tunnels`, { headers: { authorization: `Bearer ${GATEWAY_API_SECRET}` } })).json()) as { tunnels: { sessionId: string }[] };
    expect(listed.tunnels.map((x) => x.sessionId)).toContain(t.session.sessionId);
    t.agent.stop();
  });
});

describe("traffic accounting", () => {
  it("never double counts redelivered, retried or out-of-order reports", async () => {
    const { user } = await createVerifiedUser("Meter");
    const p = await createProject(user.id, project("Meter App"));
    const session = await prisma.tunnelSession.create({
      data: { projectId: p.id, userId: user.id, hostname: "meterlabelaa", localPort: 3000, expiresAt: new Date(Date.now() + 3600_000), credentialId: null },
    });
    // Sessions need a live credential to be accepted.
    const credential = await prisma.cliCredential.create({
      data: { userId: user.id, workspaceId: p.workspaceId, name: "test", tokenHash: `hash-${session.id}`, tokenPrefix: "lcl_x", expiresAt: new Date(Date.now() + 3600_000) },
    });
    await prisma.tunnelSession.update({ where: { id: session.id }, data: { credentialId: credential.id } });

    const sid = session.id;
    const hb = (connectionId: string, requests: number, bytes: number) => ({ type: "heartbeat" as const, sessionId: sid, connectionId, requests, bytesIn: bytes, bytesOut: bytes * 2 });
    await handleGatewayEvents("gw-a", [{ type: "connected", sessionId: sid, connectionId: "conn-one-aaaa" }]);
    await handleGatewayEvents("gw-a", [hb("conn-one-aaaa", 10, 100)]);
    await handleGatewayEvents("gw-a", [hb("conn-one-aaaa", 10, 100)]); // redelivered
    await handleGatewayEvents("gw-a", [hb("conn-one-aaaa", 15, 150), hb("conn-one-aaaa", 12, 120)]); // later + stale out-of-order
    await handleGatewayEvents("gw-a", [{ ...hb("conn-one-aaaa", 15, 150), type: "disconnected", reason: "ping timeout" }]);
    await handleGatewayEvents("gw-a", [{ ...hb("conn-one-aaaa", 15, 150), type: "disconnected", reason: "ping timeout" }]); // retried after a lost response
    // Reconnect (also what a gateway restart looks like): a new connection starts its own counters.
    await handleGatewayEvents("gw-b", [{ type: "connected", sessionId: sid, connectionId: "conn-two-bbbb" }, hb("conn-two-bbbb", 3, 30)]);

    const row = await prisma.tunnelSession.findUniqueOrThrow({ where: { id: sid } });
    expect(row.requestCount).toBe(18);
    expect(Number(row.bytesIn)).toBe(180);
    expect(Number(row.bytesOut)).toBe(360);
    expect(row.status).toBe("CONNECTED");
    expect(row.gatewayId).toBe("gw-b");
    const buckets = await prisma.tunnelMetric.aggregate({ where: { sessionId: sid }, _sum: { requests: true, bytesIn: true, bytesOut: true } });
    expect(buckets._sum).toEqual({ requests: 18, bytesIn: 180n, bytesOut: 360n });
    const types = (await prisma.tunnelEvent.findMany({ where: { sessionId: sid }, orderBy: { createdAt: "asc" } })).map((e) => e.type);
    expect(types).toEqual(["CONNECTED", "CONNECTION_LOST", "RECONNECTED"]); // the retried disconnect added nothing

    // A malformed or foreign connection id is ignored.
    expect((await handleGatewayEvents("gw-a", [{ type: "heartbeat", sessionId: sid, connectionId: "bad id!", requests: 999, bytesIn: 0, bytesOut: 0 }])).sessions).toEqual({});
    expect((await prisma.tunnelSession.findUniqueOrThrow({ where: { id: sid } })).requestCount).toBe(18);
  });

  it("meters real tunnel traffic into analytics, per project, scoped to the workspace and time range", async () => {
    const t = await sharingUser("Analyst");
    const second = await createProject(t.user.id, project("Second App"));
    const t2 = await share(t.token, second.id, app.port + 1);
    for (let i = 0; i < 7; i++) expect((await publicRequest(gatewayPort, t.host, "/big?bytes=1000")).status).toBe(200);
    for (let i = 0; i < 3; i++) await publicRequest(gatewayPort, t2.host, "/big?bytes=500");
    await publicRequest(gatewayPort, t.host, "/echo", { method: "POST", body: "x".repeat(400) });
    await gateway.heartbeat();
    await gateway.heartbeat(); // a second report of the same cumulative totals changes nothing

    const day = await getAnalytics(t.user.id, resolveRange({ range: "24h" }));
    expect(day.totals.requests).toBe(11);
    expect(day.totals.bytes).toBe(7 * 1000 + 3 * 500 + 400 + 400); // response bodies + the echoed upload in both directions
    expect(day.totals.active).toBe(2);
    expect(day.totals.sessions).toBe(2);
    const byName = Object.fromEntries(day.breakdown.map((r) => [r.name, r]));
    expect(byName[t.project.name]).toMatchObject({ requests: 8, sessions: 1 });
    expect(byName["Second App"]).toMatchObject({ requests: 3, bytes: 1500, sessions: 1 });
    expect(day.series.reduce((n, p) => n + p.requests, 0)).toBe(11);
    expect(day.series).toHaveLength(24);

    const onlySecond = await getAnalytics(t.user.id, resolveRange({ range: "24h" }), second.id);
    expect(onlySecond.totals.requests).toBe(3);

    // Older traffic: inside 30 days, outside 7.
    const old = new Date(Date.now() - 10 * 86_400_000);
    await prisma.tunnelMetric.create({ data: { sessionId: t.session.sessionId, projectId: t.project.id, workspaceId: t.project.workspaceId, bucketStart: hourBucket(old), requests: 100, bytesIn: 0n, bytesOut: 0n } });
    expect((await getAnalytics(t.user.id, resolveRange({ range: "7d" }))).totals.requests).toBe(11);
    expect((await getAnalytics(t.user.id, resolveRange({ range: "30d" }))).totals.requests).toBe(111);
    const isoDay = old.toISOString().slice(0, 10);
    expect((await getAnalytics(t.user.id, resolveRange({ range: "custom", from: isoDay, to: isoDay }))).totals.requests).toBe(100);
    expect(resolveRange({ range: "custom", from: "2026-01-05", to: "2026-01-01" }).error).toMatch(/start date/);

    // Another account sees nothing of this, even when it passes this workspace's project id.
    const { user: outsider } = await createVerifiedUser("Analytics Outsider");
    const theirs = await getAnalytics(outsider.id, resolveRange({ range: "30d" }), t.project.id);
    expect(theirs.project).toBeNull();
    expect(theirs.totals).toEqual({ sessions: 0, requests: 0, bytes: 0, active: 0 });
    expect(theirs.hasAnyActivity).toBe(false);
    expect(theirs.breakdown).toHaveLength(0);

    const projectView = await getProjectPreviews(t.user.id, t.project.id);
    expect(projectView.active.map((p) => p.id)).toEqual([t.session.sessionId]);
    expect((await getRecentActivity(t.user.id)).some((e) => e.type === "CONNECTED")).toBe(true);
    t.agent.stop();
    t2.agent.stop();
  });

  it("returns an honest empty dataset for a new account", async () => {
    const { user } = await createVerifiedUser("Empty Analytics");
    const empty = await getAnalytics(user.id, resolveRange({ range: "7d" }));
    expect(empty.hasAnyActivity).toBe(false);
    expect(empty.totals).toEqual({ sessions: 0, requests: 0, bytes: 0, active: 0 });
    expect(empty.series.every((p) => p.requests === 0 && p.bytes === 0)).toBe(true);
  });
});

describe("real-time updates", () => {
  it("reports connect, disconnect, reconnect and revocation as changes, only to the owning workspace", async () => {
    const { user, email } = await createVerifiedUser("Watcher");
    const { user: stranger } = await createVerifiedUser("Stranger");
    const p = await createProject(user.id, project("Watched App"));
    const tracker = newTracker(new Date());
    const strangerTracker = newTracker(new Date());
    expect((await collectChanges(user.id, tracker)).changes).toHaveLength(0);

    const token = await cliLogin(user.id);
    const t = await share(token, p.id);
    const statuses = async () => (await collectChanges(user.id, tracker)).changes.map((c) => c.status);
    expect(await statuses()).toEqual(["CONNECTED"]);
    expect(await statuses()).toEqual([]); // nothing new

    const release = t.pauseReconnect();
    gateway.disconnect(t.session.label, "simulated drop");
    await waitFor(async () => (await prisma.tunnelSession.findUniqueOrThrow({ where: { id: t.session.sessionId } })).status === "RECONNECTING", 5000, "db reconnecting");
    resetLiveTunnelCache();
    expect(await statuses()).toEqual(["RECONNECTING"]);
    release();
    await waitFor(async () => (await prisma.tunnelSession.findUniqueOrThrow({ where: { id: t.session.sessionId } })).status === "CONNECTED" && gateway.hasTunnel(t.session.label), 15_000, "reconnected");
    resetLiveTunnelCache();
    expect(await statuses()).toEqual(["CONNECTED"]);

    await publicRequest(gatewayPort, t.host, "/");
    await gateway.heartbeat();
    const traffic = (await collectChanges(user.id, tracker)).changes;
    expect(traffic).toHaveLength(1);
    expect(traffic[0].requestCount).toBeGreaterThan(0);

    await stopPreview(user.id, t.session.sessionId);
    resetLiveTunnelCache();
    const revoked = (await collectChanges(user.id, tracker)).changes;
    expect(revoked.map((c) => [c.status, c.previousStatus])).toEqual([["REVOKED", "CONNECTED"]]);
    expect((await collectChanges(stranger.id, strangerTracker)).changes).toHaveLength(0);

    // The HTTP endpoint: unauthenticated requests are rejected; signed-in streams deliver events.
    const { GET } = await import("@/app/api/dashboard/events/route");
    expect((await GET(new Request("http://localhost/api/dashboard/events"))).status).toBe(401);
    const { headers } = await signIn(email);
    const poll = await GET(new Request(`http://localhost/api/dashboard/events?mode=poll&since=${Date.now() - 60_000}`, { headers }));
    expect(poll.status).toBe(200);
    expect(((await poll.json()) as { changes: { id: string }[] }).changes.map((c) => c.id)).toContain(t.session.sessionId);

    const abort = new AbortController();
    const stream = await GET(new Request(`http://localhost/api/dashboard/events?since=${Date.now() - 60_000}`, { headers, signal: abort.signal }));
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    const reader = stream.body!.getReader();
    let text = "";
    while (!text.includes("event: previews")) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += new TextDecoder().decode(chunk.value);
    }
    expect(text).toContain(t.session.sessionId);
    expect(text).toMatch(/^retry: 3000/);
    // Subscription cleanup: cancelling the body (what a closing browser does) ends the server loop.
    await reader.cancel();
    abort.abort();

    const otherUser = await signIn((await prisma.user.findUniqueOrThrow({ where: { id: stranger.id } })).email);
    const theirs = await GET(new Request(`http://localhost/api/dashboard/events?mode=poll&since=${Date.now() - 60_000}`, { headers: otherUser.headers }));
    expect(((await theirs.json()) as { changes: unknown[] }).changes).toHaveLength(0);
  });
});

describe("Share App wizard and CLI approval", () => {
  it("finds the signed-in user's own new preview — never another user's on the same port", async () => {
    const since = new Date();
    const a = await sharingUser("Wizard A");
    const b = await sharingUser("Wizard B"); // same local port (the shared test app)

    const forA = await getShareStatus(a.user.id, since);
    expect(forA.cliLoggedIn).toBe(true);
    expect(forA.preview?.id).toBe(a.session.sessionId);
    expect(forA.preview).toMatchObject({ status: "CONNECTED", startedBeforeWizard: false, publicUrl: a.session.publicUrl });
    expect((await getShareStatus(b.user.id, since)).preview?.id).toBe(b.session.sessionId);

    // Opened the wizard after sharing started: the running preview is shown and flagged.
    const later = await getShareStatus(a.user.id, new Date(Date.now() + 1000));
    expect(later.preview).toMatchObject({ id: a.session.sessionId, startedBeforeWizard: true });

    // A user who hasn't signed in a CLI or shared anything sees the waiting state.
    const { user: fresh } = await createVerifiedUser("Wizard Fresh");
    expect(await getShareStatus(fresh.id, since)).toEqual({ cliLoggedIn: false, preview: null });

    await stopPreview(a.user.id, a.session.sessionId);
    const stopped = await getShareStatus(a.user.id, since);
    expect(stopped.preview).toMatchObject({ id: a.session.sessionId, active: false, status: "REVOKED" });
    b.agent.stop();
  });

  it("scopes a CLI login to the workspace chosen at approval, and only ones the user belongs to", async () => {
    const { user } = await createVerifiedUser("Two Workspaces");
    const { user: other } = await createVerifiedUser("Other Owner");
    const teamWorkspace = await getCurrentWorkspace(other.id);
    const api = createApi(controlPlane.url, null, "test");

    // Not a member of the other workspace: refused, and the request stays pending.
    const denied = await api.startDeviceLogin("CLI on test (linux)");
    await expect(decideDeviceAuthorization(user.id, denied.user_code, true, teamWorkspace.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(api.pollDeviceLogin(denied.device_code)).rejects.toMatchObject({ code: "authorization_pending" });

    await prisma.workspaceMember.create({ data: { workspaceId: teamWorkspace.id, userId: user.id, role: "MEMBER" } });
    const start = await api.startDeviceLogin("CLI on test (linux)");
    expect(await decideDeviceAuthorization(user.id, start.user_code, true, teamWorkspace.id)).toBe(true);
    const token = await api.pollDeviceLogin(start.device_code);
    expect(token.workspace.id).toBe(teamWorkspace.id);
  });
});
