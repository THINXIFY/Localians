// The VS Code extension's core (sign-in, sharing, protection) against the real control plane, gateway and a local app.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "@tunnel/cli/api";
import type { Gateway } from "@tunnel/gateway/gateway";
import { Auth, LoginError, SECRET_KEY, type SecretStore } from "../../extensions/vscode/src/core/auth";
import { probe } from "../../extensions/vscode/src/core/detect";
import { ShareError, ShareManager } from "../../extensions/vscode/src/core/shares";
import { projectInputSchema } from "@/lib/validation/project";
import { revokeCliCredential } from "@/server/cli/credentials";
import { decideDeviceAuthorization } from "@/server/cli/device";
import { resetLiveTunnelCache } from "@/server/cli/gateway-control";
import { prisma } from "@/server/db";
import { stopPreview } from "@/server/previews";
import { createProject } from "@/server/projects";
import { createVerifiedUser } from "./helpers";
import { GATEWAY_API_SECRET, PREVIEW_DOMAIN, publicRequest, startControlPlane, startLocalApp, startTestGateway, TUNNEL_TOKEN_SECRET, waitFor } from "./tunnel-harness";

let controlPlane: Awaited<ReturnType<typeof startControlPlane>>;
let gateway: Gateway;
let gatewayPort: number;
let controlUrl: string;
let app: Awaited<ReturnType<typeof startLocalApp>>;
const project = (name: string, port: number) => projectInputSchema.parse({ name, description: "", framework: "NEXTJS", defaultPort: String(port) });

/** VS Code's SecretStorage, in memory; `writes` lets tests prove nothing else stores the token. */
function memorySecrets(): SecretStore & { data: Map<string, string>; writes: string[] } {
  const data = new Map<string, string>();
  const writes: string[] = [];
  return {
    data,
    writes,
    get: async (k) => data.get(k),
    store: async (k, v) => {
      writes.push(k);
      data.set(k, v);
    },
    delete: async (k) => {
      data.delete(k);
    },
  };
}

/** Signs in like the extension: the "browser" approval is the same service the /cli/activate page calls. */
async function signIn(userId: string, secrets = memorySecrets(), approve = true) {
  const auth = new Auth(secrets, "localians-vscode/test");
  const opened: string[] = [];
  const credentials = await auth.signIn(controlPlane.url, "VS Code on test-machine (linux)", {
    open: async (url, code) => {
      opened.push(url);
      expect(url).toContain(`code=${code}`);
      await decideDeviceAuthorization(userId, code, approve);
      return true;
    },
    isCancelled: () => false,
    sleep: () => new Promise((r) => setTimeout(r, 20)),
  });
  return { auth, credentials, secrets, opened };
}

function manager(token: string, log: string[] = []) {
  const changes = { n: 0 };
  const api = createApi(controlPlane.url, token, "localians-vscode/test");
  const shares = new ShareManager({ api: () => api, userAgent: "localians-vscode/test", onChange: () => changes.n++, log: (l) => log.push(l), connectTimeoutMs: 10_000 });
  return { shares, api, changes, log };
}

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

describe("VS Code extension: sign-in and SecretStorage", () => {
  it("signs in through the browser approval and keeps the token only in SecretStorage", async () => {
    const { user } = await createVerifiedUser("Code User");
    const { auth, credentials, secrets, opened } = await signIn(user.id);
    expect(opened[0]).toMatch(/\/cli\/activate\?code=[A-Z]{4}-[A-Z]{4}$/);
    expect(credentials).toMatchObject({ apiUrl: controlPlane.url, user: { email: user.email } });
    expect(secrets.writes).toEqual([SECRET_KEY]);
    expect(await auth.load(controlPlane.url)).toEqual(credentials);
    // Bound to the server that issued it: another server URL doesn't get it.
    expect(await auth.load("https://other.example")).toBeNull();
    const row = await prisma.cliCredential.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.name).toBe("VS Code on test-machine (linux)");
    expect(JSON.stringify(row)).not.toContain(credentials.token);

    // Sign out revokes it on the server and removes it locally.
    expect(await auth.signOut(credentials)).toEqual({ revoked: true });
    expect(secrets.data.size).toBe(0);
    await expect(createApi(controlPlane.url, credentials.token, "t").me()).rejects.toMatchObject({ status: 401 });
  });

  it("reports denial, cancellation and an unreachable server clearly; drops expired tokens", async () => {
    const { user } = await createVerifiedUser("Code Denied");
    await expect(signIn(user.id, memorySecrets(), false)).rejects.toMatchObject({ kind: "denied" });

    const auth = new Auth(memorySecrets(), "t");
    await expect(
      auth.signIn(controlPlane.url, "VS Code", { open: () => true, isCancelled: () => true, sleep: async () => undefined }),
    ).rejects.toMatchObject({ kind: "cancelled" });
    await expect(auth.signIn("http://127.0.0.1:9", "VS Code", { open: () => true, isCancelled: () => false })).rejects.toBeInstanceOf(LoginError);

    const secrets = memorySecrets();
    secrets.data.set(SECRET_KEY, JSON.stringify({ apiUrl: controlPlane.url, token: "x", expiresAt: new Date(Date.now() - 1000).toISOString(), user: {}, workspace: {} }));
    expect(await new Auth(secrets, "t").load(controlPlane.url)).toBeNull();
    expect(secrets.data.has(SECRET_KEY)).toBe(false);
    secrets.data.set(SECRET_KEY, "{not json");
    expect(await new Auth(secrets, "t").load(controlPlane.url)).toBeNull();
  });
});

describe("VS Code extension: sharing", () => {
  it("shows Connected only after the gateway accepts the tunnel; serves the app; stops cleanly", async () => {
    const { user } = await createVerifiedUser("Code Sharer");
    const { credentials } = await signIn(user.id);
    const p = await createProject(user.id, project("Code Shop", app.port));
    const { shares, log } = manager(credentials.token);

    const address = (await probe(app.port))!.address;
    const share = await shares.start({ port: app.port, address, project: p });
    expect(share.status).toBe("connected");
    expect(gateway.hasTunnel(new URL(share.publicUrl).hostname.split(".")[0])).toBe(true);
    expect(share.publicUrl).toMatch(new RegExp(`^http://[a-z2-7]{12}\\.${PREVIEW_DOMAIN.replace(".", "\\.")}:${gatewayPort}$`));
    const host = new URL(share.publicUrl).hostname;
    expect((await publicRequest(gatewayPort, host, "/?q=vscode")).body.toString()).toContain("q=vscode");

    // One share per port.
    await expect(shares.start({ port: app.port, address, project: p })).rejects.toMatchObject({ code: "already_sharing" });

    await shares.stop(share.sessionId);
    expect(shares.get(share.sessionId)?.status).toBe("ended");
    await waitFor(async () => (await prisma.tunnelSession.findUniqueOrThrow({ where: { id: share.sessionId } })).status !== "CONNECTED", 5000, "closed");
    expect((await publicRequest(gatewayPort, host, "/")).status).toBe(404);
    shares.dismiss(share.sessionId);
    expect(shares.list()).toEqual([]);
    expect(log.join("\n")).not.toContain(credentials.token);
  });

  it("password protection from VS Code: one-way, validated, applied to the live preview", async () => {
    const { user } = await createVerifiedUser("Code Protect");
    const { credentials } = await signIn(user.id);
    const p = await createProject(user.id, project("Code Secret", app.port));
    const { shares, api } = manager(credentials.token);
    const share = await shares.start({ port: app.port, address: "127.0.0.1", project: p });
    const host = new URL(share.publicUrl).hostname;
    expect((await publicRequest(gatewayPort, host, "/")).status).toBe(200);

    await expect(api.protectProject(p.id, "short")).rejects.toMatchObject({ status: 400, code: "invalid_password" });
    expect(await api.protectProject(p.id, "vscode password 1")).toEqual({ access: "password", livePreviews: 1 });
    shares.markProtected(p.id);
    expect(shares.get(share.sessionId)?.access).toBe("password");
    await gateway.heartbeat();
    await waitFor(async () => (await publicRequest(gatewayPort, host, "/", { headers: { accept: "text/html" } })).status === 401, 5000, "protected");

    // /me reports access without ever sending the hash.
    const me = await api.me();
    const listed = me.projects.find((x) => x.id === p.id)!;
    expect(listed).toMatchObject({ access: "password", hasPassword: true });
    expect(JSON.stringify(me)).not.toMatch(/argon|\$2[aby]\$|scrypt|accessPasswordHash/);

    // Can't be used to make a project public, or to touch another workspace's project.
    const { user: other } = await createVerifiedUser("Code Other");
    const foreign = await createProject(other.id, project("Foreign", 3000));
    await expect(api.protectProject(foreign.id, "some password 1")).rejects.toMatchObject({ status: 404 });
    const raw = await fetch(`${controlPlane.url}/api/cli/projects/${p.id}/access`, {
      method: "POST",
      headers: { authorization: `Bearer ${credentials.token}`, "content-type": "application/json" },
      body: JSON.stringify({ mode: "PUBLIC" }),
    });
    expect(raw.status).toBe(400);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: p.id } })).accessMode).toBe("PASSWORD");
    await shares.stopAll();
  });

  it("ends with a clear reason when stopped from the dashboard or when the sign-in is revoked", async () => {
    const { user } = await createVerifiedUser("Code Ends");
    const { credentials } = await signIn(user.id);
    const p = await createProject(user.id, project("Code Ends", app.port));

    const first = manager(credentials.token);
    const a = await first.shares.start({ port: app.port, address: "127.0.0.1", project: p });
    await stopPreview(user.id, a.sessionId); // "Stop sharing" on the dashboard
    await waitFor(() => first.shares.get(a.sessionId)?.status === "ended", 10_000, "ended from dashboard");
    expect(first.shares.get(a.sessionId)?.stopReason).toBe("ended");
    expect(first.shares.get(a.sessionId)?.endMessage).toBeTruthy();

    const second = manager(credentials.token);
    const b = await second.shares.start({ port: app.port, address: "127.0.0.1", project: p });
    const credential = await prisma.cliCredential.findFirstOrThrow({ where: { userId: user.id, revokedAt: null } });
    await revokeCliCredential(user.id, credential.id); // Settings → CLI → Revoke
    await gateway.heartbeat();
    await waitFor(() => second.shares.get(b.sessionId)?.status === "ended", 10_000, "ended by revocation");
    expect(second.shares.get(b.sessionId)?.stopReason).toBe("auth");
    expect(second.shares.get(b.sessionId)?.endMessage).toContain("Sign in again");
    await expect(second.shares.start({ port: app.port, address: "127.0.0.1", project: p })).rejects.toMatchObject({ code: "auth" });
  });

  it("refuses projects that are gone and apps that aren't running", async () => {
    const { user } = await createVerifiedUser("Code Missing");
    const { credentials } = await signIn(user.id);
    const { shares } = manager(credentials.token);
    await expect(shares.start({ port: app.port, address: "127.0.0.1", project: { id: "nope-not-a-project", name: "x" } })).rejects.toBeInstanceOf(ShareError);
    expect(shares.list()).toEqual([]);
    expect(await probe(1)).toBeNull();
    const signedOut = new ShareManager({ api: () => null, userAgent: "t", onChange: () => undefined });
    await expect(signedOut.start({ port: app.port, address: "127.0.0.1", project: { id: "x", name: "x" } })).rejects.toMatchObject({ code: "signed_out" });
  });
});
