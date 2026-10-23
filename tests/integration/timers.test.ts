import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startAgent } from "@tunnel/cli/agent";
import { ApiError, createApi } from "@tunnel/cli/api";
import type { Gateway } from "@tunnel/gateway/gateway";
import { DURATION_OPTIONS, TIME_UP_REASON } from "@tunnel/shared/durations";
import { projectInputSchema } from "@/lib/validation/project";
import { hashPassword, verifyPreviewAccess } from "@/server/access";
import { decideDeviceAuthorization } from "@/server/cli/device";
import { sweepStaleTunnels } from "@/server/cli/tunnels";
import { prisma } from "@/server/db";
import { effectiveStatus } from "@/server/previews";
import { createProject } from "@/server/projects";
import { createShareSetup, SetupError, updateShareSetup } from "@/server/share-setup";
import { createVerifiedUser } from "./helpers";
import { GATEWAY_API_SECRET, PREVIEW_DOMAIN, publicRequest, startControlPlane, startLocalApp, startTestGateway, TUNNEL_TOKEN_SECRET, waitFor } from "./tunnel-harness";

const project = (name: string, port: number) => projectInputSchema.parse({ name, description: "", framework: "NEXTJS", defaultPort: String(port) });

let controlPlane: Awaited<ReturnType<typeof startControlPlane>>;
let gateway: Gateway;
let gatewayPort: number;
let app: Awaited<ReturnType<typeof startLocalApp>>;

beforeAll(async () => {
  Object.assign(process.env, { TUNNEL_PREVIEW_DOMAIN: PREVIEW_DOMAIN, TUNNEL_TOKEN_SECRET, GATEWAY_API_SECRET, TUNNEL_PUBLIC_SCHEME: "http", CLI_DEVICE_RATE_LIMIT: "1000" });
  controlPlane = await startControlPlane();
  ({ gateway, port: gatewayPort } = await startTestGateway(controlPlane.url));
  process.env.TUNNEL_GATEWAY_URL = `http://127.0.0.1:${gatewayPort}`;
  process.env.TUNNEL_PUBLIC_PORT = String(gatewayPort);
  app = await startLocalApp();
});

afterAll(async () => {
  await app?.close();
  await gateway?.close();
  await controlPlane?.close();
});

async function login(name: string) {
  const { user } = await createVerifiedUser(name);
  const anon = createApi(controlPlane.url, null, "test");
  const start = await anon.startDeviceLogin("CLI on timer-test");
  await decideDeviceAuthorization(user.id, start.user_code, true);
  const { access_token } = await anon.pollDeviceLogin(start.device_code);
  return { user, api: createApi(controlPlane.url, access_token, "test") };
}

function connect(api: ReturnType<typeof createApi>, session: { sessionId: string; gatewayUrl: string; connectToken: string }) {
  let first: string | null = session.connectToken;
  return startAgent({
    gatewayUrl: session.gatewayUrl,
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
}

const near = (actual: Date | string, expected: number, slackMs = 10_000) => Math.abs(new Date(actual).getTime() - expected) < slackMs;

describe("preview durations (server-enforced)", () => {
  it("accepts every free option, records it, and defaults older clients to 24 hours", async () => {
    const { user, api } = await login("Duration Options");
    const p = await createProject(user.id, project("Durations", app.port));
    for (const option of DURATION_OPTIONS.filter((o) => o.plan === "free")) {
      const started = Date.now();
      const session = await api.createTunnel(p.id, app.port, option.minutes);
      expect(session.durationMinutes).toBe(option.minutes);
      expect(near(session.expiresAt, started + option.minutes * 60_000), option.label).toBe(true);
      const row = await prisma.tunnelSession.findUniqueOrThrow({ where: { id: session.sessionId } });
      expect(row.durationMinutes).toBe(option.minutes);
      await api.closeTunnel(session.sessionId);
    }
    // No durationMinutes (CLI / VS Code versions from before timers): the free maximum, as before.
    const legacy = await api.createTunnel(p.id, app.port);
    expect(legacy.durationMinutes).toBe(24 * 60);
    expect(near(legacy.expiresAt, Date.now() + 24 * 3600_000)).toBe(true);
    await api.closeTunnel(legacy.sessionId);
  });

  it("rejects durations that aren't offered, and longer ones without a Preview Pass", async () => {
    const { user, api } = await login("Duration Limits");
    const p = await createProject(user.id, project("Limits", app.port));
    for (const bad of [0, 7, 61, 100_000, -5]) {
      await expect(api.createTunnel(p.id, app.port, bad)).rejects.toMatchObject({ status: 400, code: "invalid_duration" });
    }
    // A fractional value can't sneak past the option check either.
    await expect(api.createTunnel(p.id, app.port, 60.5)).rejects.toMatchObject({ status: 400, code: "invalid_duration" });
    for (const paid of [3 * 24 * 60, 7 * 24 * 60]) {
      await expect(api.createTunnel(p.id, app.port, paid)).rejects.toMatchObject({ status: 403, code: "plan_required" });
    }
    expect(await prisma.tunnelSession.count({ where: { userId: user.id } })).toBe(0);
  });

  it("caps how many previews one user can start per 24 hours", async () => {
    const { user, api } = await login("Session Cap");
    const p = await createProject(user.id, project("Cap", app.port));
    process.env.QUOTA_SESSIONS_PER_DAY = "3";
    try {
      for (let i = 0; i < 3; i++) await api.closeTunnel((await api.createTunnel(p.id, app.port, 5)).sessionId);
      const error = await api.createTunnel(p.id, app.port, 5).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 429, code: "too_many_sessions" });
    } finally {
      delete process.env.QUOTA_SESSIONS_PER_DAY;
    }
  });
});

describe("expiry enforcement", () => {
  it("the gateway stops serving at the deadline on its own — no heartbeat needed — and the session is Expired", async () => {
    const { user, api } = await login("Gateway Deadline");
    const p = await createProject(user.id, project("Deadline", app.port));
    const session = await api.createTunnel(p.id, app.port, 5);
    const agent = connect(api, session);
    const host = `${session.label}.${PREVIEW_DOMAIN}`;
    await waitFor(() => agent.state === "connected" && gateway.hasTunnel(session.label), 10_000, "connected");
    await waitFor(async () => (await publicRequest(gatewayPort, host, "/")).status === 200, 5000, "serving");

    // Shorten the session, then let one heartbeat deliver the new deadline to the gateway.
    const deadline = Date.now() + 1500;
    await prisma.tunnelSession.update({ where: { id: session.sessionId }, data: { expiresAt: new Date(deadline) } });
    await gateway.heartbeat();
    expect((await publicRequest(gatewayPort, host, "/")).status).toBe(200); // still within its time

    await new Promise((r) => setTimeout(r, Math.max(0, deadline - Date.now()) + 300));
    // No further heartbeat: the gateway's own timer closed it.
    const after = await publicRequest(gatewayPort, host, "/");
    expect(after.status).toBe(410);
    expect(after.headers["x-localians-gateway-error"]).toBe("expired");
    expect(after.body.toString()).toContain("This preview has expired");
    expect(gateway.hasTunnel(session.label)).toBe(false);

    // The CLI can't get back in: its reconnect is refused with a clear reason.
    expect(await agent.done).toBe("ended");
    await expect(api.connectToken(session.sessionId)).rejects.toMatchObject({ status: 410, message: expect.stringContaining("time is up") });
    await waitFor(async () => (await prisma.tunnelSession.findUniqueOrThrow({ where: { id: session.sessionId } })).status === "EXPIRED", 5000, "db expired");
    const row = await prisma.tunnelSession.findUniqueOrThrow({ where: { id: session.sessionId } });
    expect(row.endReason).toBe(TIME_UP_REASON);
    expect(effectiveStatus(row, null).status).toBe("EXPIRED");
  });

  it("an expired session stays expired after a gateway restart or with a still-valid connect token", async () => {
    const { user, api } = await login("Restart Expiry");
    const p = await createProject(user.id, project("Restart", app.port));
    const session = await api.createTunnel(p.id, app.port, 15);
    // A connect token minted while the session was valid…
    const token = await api.connectToken(session.sessionId);
    // …then its time runs out while nothing is connected (e.g. the gateway was restarting).
    await prisma.tunnelSession.update({ where: { id: session.sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const restarted = await startTestGateway(controlPlane.url, [], { gatewayId: "gw-restarted" });
    try {
      const agent = startAgent({ gatewayUrl: `http://127.0.0.1:${restarted.port}`, localPort: app.port, localAddress: "127.0.0.1", getConnectToken: async () => token });
      await new Promise((r) => setTimeout(r, 800));
      // The gateway asked the control plane first and refused to route it.
      expect(restarted.gateway.hasTunnel(session.label)).toBe(false);
      expect((await publicRequest(restarted.port, `${session.label}.${PREVIEW_DOMAIN}`, "/")).status).not.toBe(200);
      agent.stop();
      await agent.done;
    } finally {
      await restarted.gateway.close();
    }
    const row = await prisma.tunnelSession.findUniqueOrThrow({ where: { id: session.sessionId } });
    expect(row.status).toBe("EXPIRED");
    expect(row.endReason).toBe(TIME_UP_REASON);
    await expect(api.connectToken(session.sessionId)).rejects.toMatchObject({ status: 410 });
  });

  it("password-protected previews can't be unlocked after their time is up", async () => {
    const { user, api } = await login("Protected Expiry");
    const p = await createProject(user.id, project("Protected", app.port));
    await prisma.project.update({ where: { id: p.id }, data: { accessMode: "PASSWORD", accessPasswordHash: await hashPassword("correct horse") } });
    const session = await api.createTunnel(p.id, app.port, 30);
    expect(await verifyPreviewAccess(session.sessionId, "correct horse", "203.0.113.9")).toMatchObject({ ok: true, policy: { mode: "password", expiresAt: new Date(session.expiresAt).getTime() } });
    await prisma.tunnelSession.update({ where: { id: session.sessionId }, data: { expiresAt: new Date(Date.now() - 1) } });
    expect(await verifyPreviewAccess(session.sessionId, "correct horse", "203.0.113.9")).toEqual({ ok: false, error: "ended" });
  });

  it("the sweep reports time-up as Expired and a vanished CLI as Offline", async () => {
    const { user } = await createVerifiedUser("Sweep Reasons");
    const p = await createProject(user.id, project("Sweep", 3000));
    const base = { projectId: p.id, userId: user.id, localPort: 3000, status: "CONNECTED" as const, connectedAt: new Date(Date.now() - 600_000) };
    const timeUp = await prisma.tunnelSession.create({ data: { ...base, hostname: "sweeptimeupa", lastHeartbeatAt: new Date(Date.now() - 5 * 60_000), expiresAt: new Date(Date.now() - 1000) } });
    const offline = await prisma.tunnelSession.create({ data: { ...base, hostname: "sweepofflinb", lastHeartbeatAt: new Date(Date.now() - 5 * 60_000), expiresAt: new Date(Date.now() + 3600_000) } });
    const never = await prisma.tunnelSession.create({ data: { ...base, connectedAt: null, lastHeartbeatAt: null, createdAt: new Date(Date.now() - 5 * 60_000), hostname: "sweepnevercc", expiresAt: new Date(Date.now() + 3600_000) } });
    await sweepStaleTunnels({ projectId: p.id });
    const rows = await prisma.tunnelSession.findMany({ where: { projectId: p.id } });
    const by = (id: string) => rows.find((r) => r.id === id)!;
    expect(by(timeUp.id)).toMatchObject({ status: "EXPIRED", endReason: TIME_UP_REASON });
    expect(effectiveStatus(by(timeUp.id), null).status).toBe("EXPIRED");
    expect(effectiveStatus(by(offline.id), null).status).toBe("OFFLINE");
    expect(effectiveStatus(by(never.id), null).status).toBe("FAILED");
  });
});

describe("dashboard setup codes carry the duration", () => {
  it("saves the chosen duration, hands it to the CLI, and refuses longer-than-plan choices", async () => {
    const { user, api } = await login("Setup Duration");
    const p = await createProject(user.id, project("Setup", app.port));
    const setup = await createShareSetup(user.id);
    await updateShareSetup(user.id, setup.id, { port: app.port, durationMinutes: 15, project: { kind: "existing", id: p.id }, access: { mode: "PUBLIC" } });
    await expect(updateShareSetup(user.id, setup.id, { port: app.port, durationMinutes: 7 * 24 * 60, project: { kind: "existing", id: p.id }, access: { mode: "PUBLIC" } })).rejects.toBeInstanceOf(
      SetupError,
    );
    await expect(updateShareSetup(user.id, setup.id, { port: app.port, durationMinutes: 7, project: { kind: "existing", id: p.id }, access: { mode: "PUBLIC" } })).rejects.toThrow();

    // What `localians share <port> --setup <code>` does.
    const redeemed = await api.redeemSetup(setup.code, app.port);
    expect(redeemed.durationMinutes).toBe(15);
    const session = await api.createTunnel(redeemed.project!.id, app.port, redeemed.durationMinutes ?? undefined);
    expect(near(session.expiresAt, Date.now() + 15 * 60_000)).toBe(true);
    await api.closeTunnel(session.sessionId);
  });
});
