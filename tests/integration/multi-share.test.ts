import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startAgent, type StopReason } from "@tunnel/cli/agent";
import { createApi } from "@tunnel/cli/api";
import type { Gateway } from "@tunnel/gateway/gateway";
import { projectInputSchema } from "@/lib/validation/project";
import { CLI_TOKEN_TTL_MS } from "@/server/cli/config";
import { decideDeviceAuthorization } from "@/server/cli/device";
import { REPLACED_SAME_PORT } from "@/server/cli/tunnels";
import { prisma } from "@/server/db";
import { grantPass } from "@/server/passes";
import { createProject } from "@/server/projects";
import { createShareSetup } from "@/server/share-setup";
import { createVerifiedUser } from "./helpers";
import { GATEWAY_API_SECRET, PREVIEW_DOMAIN, publicRequest, startControlPlane, startLocalApp, startTestGateway, TUNNEL_TOKEN_SECRET, waitFor } from "./tunnel-harness";

// One account, several local apps shared at the same time: each with its own project, port, link, tunnel, expiry and
// access; stopping, replacing or losing one never touches the others. Plus the login details clients rely on.

const project = (name: string, port: number) => projectInputSchema.parse({ name, description: "", framework: "NEXTJS", defaultPort: String(port) });
const DAY = 86_400_000;

let controlPlane: Awaited<ReturnType<typeof startControlPlane>>;
let gateway: Gateway;
let gatewayPort: number;
const apps: Awaited<ReturnType<typeof startLocalApp>>[] = [];

beforeAll(async () => {
  Object.assign(process.env, { TUNNEL_PREVIEW_DOMAIN: PREVIEW_DOMAIN, TUNNEL_TOKEN_SECRET, GATEWAY_API_SECRET, TUNNEL_PUBLIC_SCHEME: "http", CLI_DEVICE_RATE_LIMIT: "1000" });
  controlPlane = await startControlPlane();
  const started = await startTestGateway(controlPlane.url);
  ({ gateway, port: gatewayPort } = started);
  process.env.TUNNEL_GATEWAY_URL = `http://127.0.0.1:${gatewayPort}`;
  process.env.TUNNEL_PUBLIC_PORT = String(gatewayPort);
  process.env.GATEWAY_CONTROL_URL = started.adminUrl;
  for (let i = 0; i < 3; i++) apps.push(await startLocalApp());
});

afterAll(async () => {
  delete process.env.GATEWAY_CONTROL_URL;
  delete process.env.QUOTA_ACTIVE_PREVIEWS_PER_USER;
  await Promise.all(apps.map((a) => a.close()));
  await gateway?.close();
  await controlPlane?.close();
});

async function cliLogin(userId: string, clientName = "CLI on laptop (win32)") {
  const anon = createApi(controlPlane.url, null, "test");
  const start = await anon.startDeviceLogin(clientName);
  await decideDeviceAuthorization(userId, start.user_code, true);
  return anon.pollDeviceLogin(start.device_code);
}

/** Like one `localians share <port>` terminal: its own session and agent, reconnecting with fresh tokens. */
async function share(token: string, projectId: string, port: number) {
  const api = createApi(controlPlane.url, token, "test");
  const session = await api.createTunnel(projectId, port);
  let first: string | null = session.connectToken;
  let ended: StopReason | null = null;
  const agent = startAgent({
    gatewayUrl: session.gatewayUrl,
    localPort: port,
    localAddress: "127.0.0.1",
    getConnectToken: async () => {
      const t = first ?? (await api.connectToken(session.sessionId));
      first = null;
      return t;
    },
  });
  void agent.done.then((r) => (ended = r));
  await waitFor(() => agent.state === "connected" && gateway.hasTunnel(session.label), 10_000, `share of :${port} connected`);
  return { api, session, agent, host: `${session.label}.${PREVIEW_DOMAIN}`, ended: () => ended };
}

const hits = (i: number) => apps[i].seen.length;

describe("several apps shared at once by one account", () => {
  it("each share has its own project, port, link, tunnel, expiry and access; stopping one leaves the others running", async () => {
    const { user } = await createVerifiedUser("Parallel Dev");
    const { access_token: token } = await cliLogin(user.id);
    const [web, vite, api] = await Promise.all([
      createProject(user.id, project("Web", apps[0].port)),
      createProject(user.id, project("Vite", apps[1].port)),
      createProject(user.id, project("API", apps[2].port)),
    ]);
    await grantPass({ projectId: api.id, source: "ADMIN", actor: { type: "ADMIN" } }); // one paid, two free
    await prisma.project.update({ where: { id: vite.id }, data: { accessMode: "PASSWORD", accessPasswordHash: "x".repeat(60) } });

    const shares = [await share(token, web.id, apps[0].port), await share(token, vite.id, apps[1].port), await share(token, api.id, apps[2].port)];
    expect(new Set(shares.map((s) => s.session.publicUrl)).size).toBe(3);
    expect(new Set(shares.map((s) => s.session.sessionId)).size).toBe(3);
    expect(shares.map((s) => s.session.project.name)).toEqual(["Web", "Vite", "API"]);
    expect(shares.map((s) => s.session.plan)).toEqual(["free", "free", "pass"]);
    expect(shares.map((s) => s.session.access)).toEqual(["public", "password", "public"]);
    expect(shares[2].session.expiresAt).not.toBe(shares[0].session.expiresAt);

    // Each link reaches its own app only (the gateway multiplexes by hostname).
    const before = [hits(0), hits(1), hits(2)];
    expect((await publicRequest(gatewayPort, shares[0].host, "/")).status).toBe(200);
    expect((await publicRequest(gatewayPort, shares[2].host, "/")).status).toBe(200);
    expect([hits(0) - before[0], hits(1) - before[1], hits(2) - before[2]]).toEqual([1, 0, 1]);
    expect((await publicRequest(gatewayPort, shares[1].host, "/", { headers: { accept: "text/html" } })).status).toBe(401); // its own password

    // The CLI sees all of them.
    const listed = await createApi(controlPlane.url, token, "test").listTunnels();
    expect(listed.tunnels.map((t) => t.localPort).sort()).toEqual(apps.map((a) => a.port).sort());

    // Stop the middle one: the other two keep serving.
    shares[1].agent.stop();
    await shares[1].agent.done;
    await shares[1].api.closeTunnel(shares[1].session.sessionId);
    await waitFor(() => !gateway.hasTunnel(shares[1].session.label), 5000, "stopped one gone");
    for (const i of [0, 2]) {
      expect(gateway.hasTunnel(shares[i].session.label)).toBe(true);
      expect((await publicRequest(gatewayPort, shares[i].host, "/")).status).toBe(200);
    }

    // A dropped connection on one reconnects to the same link, without disturbing the other.
    const label = shares[0].session.label;
    gateway.disconnect(label, "simulated network drop");
    await waitFor(() => shares[0].agent.state !== "connected", 5000, "dropped");
    expect(gateway.hasTunnel(shares[2].session.label)).toBe(true);
    await waitFor(() => gateway.hasTunnel(label) && shares[0].agent.state === "connected", 15_000, "reconnected");
    expect((await publicRequest(gatewayPort, shares[2].host, "/")).status).toBe(200);

    shares[0].agent.stop();
    shares[2].agent.stop();
    await Promise.all([shares[0].agent.done, shares[2].agent.done]);
  });

  it("re-sharing a port from the same computer replaces only that share; other ports and other computers are untouched", async () => {
    const { user } = await createVerifiedUser("Restart Dev");
    const laptop = (await cliLogin(user.id, "CLI on laptop")).access_token;
    const desktop = (await cliLogin(user.id, "CLI on desktop")).access_token;
    const a = await createProject(user.id, project("Alpha", apps[0].port));
    const b = await createProject(user.id, project("Beta", apps[1].port));

    const first = await share(laptop, a.id, apps[0].port);
    const other = await share(laptop, b.id, apps[1].port);
    const elsewhere = await share(desktop, a.id, apps[0].port); // same port, another computer: allowed alongside

    const again = await share(laptop, a.id, apps[0].port); // e.g. the first terminal crashed and was restarted
    await waitFor(() => first.ended() === "ended", 10_000, "replaced share stopped");
    expect(gateway.hasTunnel(first.session.label)).toBe(false);
    expect((await prisma.tunnelSession.findUniqueOrThrow({ where: { id: first.session.sessionId } })).endReason).toBe(REPLACED_SAME_PORT);
    await expect(first.api.connectToken(first.session.sessionId)).rejects.toMatchObject({ message: `A newer share of localhost:${apps[0].port} from this computer took over. This one has stopped.` });

    for (const s of [other, elsewhere, again]) expect((await publicRequest(gatewayPort, s.host, "/")).status).toBe(200);
    for (const s of [other, elsewhere, again]) s.agent.stop();
    await Promise.all([other, elsewhere, again].map((s) => s.agent.done));
  });

  it("enforces the concurrent-share limit server-side, per account, whatever the client", async () => {
    process.env.QUOTA_ACTIVE_PREVIEWS_PER_USER = "2";
    try {
      const { user } = await createVerifiedUser("Limit Dev");
      const cli = (await cliLogin(user.id, "CLI")).access_token;
      const vscode = (await cliLogin(user.id, "VS Code")).access_token;
      const p = await createProject(user.id, project("Limited", apps[0].port));
      const one = await share(cli, p.id, apps[0].port);
      const two = await share(vscode, p.id, apps[1].port);
      await expect(createApi(controlPlane.url, cli, "test").createTunnel(p.id, apps[2].port)).rejects.toMatchObject({ status: 429, code: "too_many_tunnels", message: "You can share up to 2 apps at once. Stop another share first." });
      expect((await createApi(controlPlane.url, cli, "test").me()).limits).toEqual({ activePreviews: 2 });
      // Another account isn't affected by this one's shares.
      const { user: other } = await createVerifiedUser("Other Dev");
      const otherToken = (await cliLogin(other.id)).access_token;
      const q = await createProject(other.id, project("Other", apps[2].port));
      const theirs = await share(otherToken, q.id, apps[2].port);
      for (const s of [one, two, theirs]) s.agent.stop();
      await Promise.all([one, two, theirs].map((s) => s.agent.done));
    } finally {
      delete process.env.QUOTA_ACTIVE_PREVIEWS_PER_USER;
    }
  });

  it("free entitlements stay per project: a second project can't reuse the first one's free window", async () => {
    const { user } = await createVerifiedUser("Free Dev");
    const token = (await cliLogin(user.id)).access_token;
    const api = createApi(controlPlane.url, token, "test");
    const a = await createProject(user.id, project("Free A", apps[0].port));
    const b = await createProject(user.id, project("Free B", apps[1].port));
    // A's window is over; B's hasn't started. Sharing both: A refused, B starts its own window.
    await prisma.freePreviewGrant.create({ data: { projectId: a.id, workspaceId: a.workspaceId, userId: user.id, startedAt: new Date(Date.now() - 2 * DAY), endsAt: new Date(Date.now() - DAY) } });
    await expect(api.createTunnel(a.id, apps[0].port)).rejects.toMatchObject({ code: "free_used" });
    const s = await api.createTunnel(b.id, apps[1].port);
    expect(s.plan).toBe("free");
    expect(await prisma.freePreviewGrant.count({ where: { projectId: b.id } })).toBe(1);
    await api.closeTunnel(s.sessionId);
  });
});

describe("logins: who, renewal, logout, switching accounts", () => {
  it("/me says who is signed in (username, public id — never the internal id) and when the login expires", async () => {
    const { user } = await createVerifiedUser("Whoami Person");
    await prisma.user.update({ where: { id: user.id }, data: { username: "whoami_person" } });
    const login = await cliLogin(user.id);
    expect(login.user).toMatchObject({ username: "whoami_person", email: user.email });
    expect(login.user.id).toMatch(/^LOC-\d{6}$/);
    const me = await createApi(controlPlane.url, login.access_token, "test").me();
    expect(me.user).toEqual(login.user);
    expect(JSON.stringify(me)).not.toContain(user.id);
    expect(new Date(me.credential!.expiresAt).getTime()).toBeGreaterThan(Date.now() + CLI_TOKEN_TTL_MS - 60_000);
  });

  it("a login in use renews itself; an unused one still expires; a revoked one is never renewed", async () => {
    const { user } = await createVerifiedUser("Renew Person");
    const login = await cliLogin(user.id);
    const credential = await prisma.cliCredential.findFirstOrThrow({ where: { userId: user.id } });
    const soon = new Date(Date.now() + 5 * DAY);
    await prisma.cliCredential.update({ where: { id: credential.id }, data: { expiresAt: soon, lastUsedAt: null } });
    const me = await createApi(controlPlane.url, login.access_token, "test").me();
    expect(new Date(me.credential!.expiresAt).getTime()).toBeGreaterThan(Date.now() + CLI_TOKEN_TTL_MS - 60_000);
    expect((await prisma.cliCredential.findUniqueOrThrow({ where: { id: credential.id } })).expiresAt.getTime()).toBe(new Date(me.credential!.expiresAt).getTime());

    await prisma.cliCredential.update({ where: { id: credential.id }, data: { expiresAt: new Date(Date.now() - 1000), lastUsedAt: null } });
    await expect(createApi(controlPlane.url, login.access_token, "test").me()).rejects.toMatchObject({ status: 401 });

    await prisma.cliCredential.update({ where: { id: credential.id }, data: { expiresAt: soon, lastUsedAt: null, revokedAt: new Date() } });
    await expect(createApi(controlPlane.url, login.access_token, "test").me()).rejects.toMatchObject({ status: 401 });
    expect((await prisma.cliCredential.findUniqueOrThrow({ where: { id: credential.id } })).expiresAt.getTime()).toBe(soon.getTime());
  });

  it("switching accounts: logout revokes and stops that login's shares; the next login sees only its own projects and setup codes", async () => {
    const { user: alice } = await createVerifiedUser("Alice Switch");
    const { user: bob } = await createVerifiedUser("Bob Switch");
    const aliceProject = await createProject(alice.id, project("Alice App", apps[0].port));
    const bobProject = await createProject(bob.id, project("Bob App", apps[1].port));

    const aliceToken = (await cliLogin(alice.id)).access_token;
    const live = await share(aliceToken, aliceProject.id, apps[0].port);
    await createApi(controlPlane.url, aliceToken, "test").logout();
    await waitFor(() => live.ended() !== null, 10_000, "alice's share stopped on logout");
    expect(gateway.hasTunnel(live.session.label)).toBe(false);
    await expect(createApi(controlPlane.url, aliceToken, "test").me()).rejects.toMatchObject({ status: 401 });

    const bobApi = createApi(controlPlane.url, (await cliLogin(bob.id)).access_token, "test");
    const me = await bobApi.me();
    expect(me.projects.map((p) => p.id)).toEqual([bobProject.id]);
    await expect(bobApi.createTunnel(aliceProject.id, apps[0].port)).rejects.toMatchObject({ status: 404 });
    // Alice's dashboard command, run while signed in as Bob: told to switch, nothing about Alice revealed.
    const aliceSetup = await createShareSetup(alice.id);
    const refused = await bobApi.redeemSetup(aliceSetup.code, apps[0].port).catch((e: Error) => e);
    expect(refused).toMatchObject({ status: 403, code: "setup_wrong_account" });
    expect((refused as Error).message).not.toMatch(/alice/i);
  });
});
