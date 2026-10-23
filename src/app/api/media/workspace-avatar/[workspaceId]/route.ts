import { prisma } from "@/server/db";
import { readMedia } from "@/server/media";
import { imageResponse, notFound } from "@/server/media-response";
import { getSession } from "@/server/session";

/** A workspace's current avatar, for members of that workspace only. Callers add ?v=<avatarId> to bust caches. */
export async function GET(_request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const session = await getSession();
  if (!session || !/^[a-z0-9]{20,40}$/.test(workspaceId)) return notFound();
  const membership = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: session.user.id } }, select: { workspace: { select: { avatarId: true } } } });
  const avatarId = membership?.workspace.avatarId;
  if (!avatarId) return notFound();
  const media = await prisma.mediaFile.findUnique({ where: { id: avatarId } });
  if (!media || media.kind !== "workspace_avatar" || media.workspaceId !== workspaceId) return notFound();
  const body = await readMedia(media).catch(() => null);
  return body ? imageResponse(body, media.contentType, "private, max-age=86400") : notFound();
}
