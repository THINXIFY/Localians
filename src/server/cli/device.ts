import "server-only";
import { DeviceAuthStatus } from "@/generated/prisma/enums";
import { prisma } from "../db";
import { getCurrentWorkspace, requireMembership } from "../workspaces";
import { CLI_TOKEN_TTL_MS, DEVICE_CODE_TTL_MS, DEVICE_POLL_INTERVAL_S, siteUrl } from "./config";
import { CLI_USER_SELECT, cliUser, type CliUser } from "./credentials";
import { formatUserCode, generateCliToken, generateDeviceCode, generateUserCode, normalizeUserCode, sha256 } from "./crypto";

/** RFC 8628 §3.1–3.2: start a device authorization. */
export async function startDeviceAuthorization(clientName: string) {
  // Opportunistic cleanup of long-dead requests.
  await prisma.deviceAuthorization.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });

  const deviceCode = generateDeviceCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const userCode = generateUserCode();
    try {
      await prisma.deviceAuthorization.create({
        data: {
          deviceCodeHash: sha256(deviceCode),
          userCode,
          clientName: clientName.slice(0, 80) || "Localians CLI",
          expiresAt: new Date(Date.now() + DEVICE_CODE_TTL_MS),
        },
      });
      const verificationUri = `${siteUrl()}/cli/activate`;
      return {
        device_code: deviceCode,
        user_code: formatUserCode(userCode),
        verification_uri: verificationUri,
        verification_uri_complete: `${verificationUri}?code=${formatUserCode(userCode)}`,
        expires_in: Math.floor(DEVICE_CODE_TTL_MS / 1000),
        interval: DEVICE_POLL_INTERVAL_S,
      };
    } catch {
      // userCode collision (unique constraint) — try another.
    }
  }
  throw new Error("Could not allocate a device code.");
}

type PollResult =
  | { ok: true; accessToken: string; expiresAt: Date; user: CliUser; workspace: { id: string; name: string } }
  | { ok: false; error: "authorization_pending" | "slow_down" | "expired_token" | "access_denied" | "invalid_grant" };

/** RFC 8628 §3.4–3.5: the CLI polls until the user approves or denies. */
export async function pollDeviceAuthorization(deviceCode: string): Promise<PollResult> {
  if (typeof deviceCode !== "string" || deviceCode.length > 128) return { ok: false, error: "invalid_grant" };
  const request = await prisma.deviceAuthorization.findUnique({ where: { deviceCodeHash: sha256(deviceCode) } });
  if (!request || request.status === DeviceAuthStatus.CONSUMED) return { ok: false, error: "invalid_grant" };
  if (request.expiresAt < new Date()) return { ok: false, error: "expired_token" };
  if (request.status === DeviceAuthStatus.DENIED) return { ok: false, error: "access_denied" };

  if (request.status === DeviceAuthStatus.PENDING) {
    const tooFast = request.lastPolledAt && Date.now() - request.lastPolledAt.getTime() < (DEVICE_POLL_INTERVAL_S - 1) * 1000;
    await prisma.deviceAuthorization.update({ where: { id: request.id }, data: { lastPolledAt: new Date() } });
    return { ok: false, error: tooFast ? "slow_down" : "authorization_pending" };
  }

  // APPROVED → issue a credential exactly once (the status flip is the guard against double issue).
  const { count } = await prisma.deviceAuthorization.updateMany({
    where: { id: request.id, status: DeviceAuthStatus.APPROVED },
    data: { status: DeviceAuthStatus.CONSUMED },
  });
  if (count !== 1 || !request.userId || !request.workspaceId) return { ok: false, error: "invalid_grant" };

  const { token, hash, prefix } = generateCliToken();
  const expiresAt = new Date(Date.now() + CLI_TOKEN_TTL_MS);
  const credential = await prisma.cliCredential.create({
    data: { userId: request.userId, workspaceId: request.workspaceId, name: request.clientName, tokenHash: hash, tokenPrefix: prefix, expiresAt },
    select: { user: { select: CLI_USER_SELECT }, workspace: { select: { id: true, name: true } } },
  });
  return { ok: true, accessToken: token, expiresAt, user: cliUser(credential.user), workspace: credential.workspace };
}

/** Looks up a pending request by the code the user typed (for the approval page). */
export async function findPendingDeviceAuthorization(userCodeInput: string) {
  const userCode = normalizeUserCode(userCodeInput);
  if (!userCode) return null;
  const request = await prisma.deviceAuthorization.findUnique({ where: { userCode } });
  if (!request || request.status !== DeviceAuthStatus.PENDING || request.expiresAt < new Date()) return null;
  return { id: request.id, userCode: formatUserCode(request.userCode), clientName: request.clientName, expiresAt: request.expiresAt };
}

/** The signed-in user approves or denies a pending request. */
/** Approves or denies a pending CLI login. The credential is scoped to `workspaceId` (default: the current workspace), which the user must belong to. */
export async function decideDeviceAuthorization(userId: string, userCodeInput: string, approve: boolean, workspaceId?: string) {
  const userCode = normalizeUserCode(userCodeInput);
  if (!userCode) return false;
  const workspace = workspaceId ? { id: workspaceId } : await getCurrentWorkspace(userId);
  if (workspaceId) await requireMembership(userId, workspaceId);
  const { count } = await prisma.deviceAuthorization.updateMany({
    where: { userCode, status: DeviceAuthStatus.PENDING, expiresAt: { gt: new Date() } },
    data: approve
      ? { status: DeviceAuthStatus.APPROVED, userId, workspaceId: workspace.id, decidedAt: new Date() }
      : { status: DeviceAuthStatus.DENIED, decidedAt: new Date() },
  });
  return count === 1;
}
