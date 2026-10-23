import { prisma } from "@/server/db";
import { readMedia } from "@/server/media";
import { imageResponse, notFound } from "@/server/media-response";
import { getSession } from "@/server/session";

/**
 * A payment QR image (an upload that was verified to encode its wallet). Signed-in users only: it is shown in the
 * checkout and in /admin/settings. Rows are immutable, so the response can be cached for good.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{20,40}$/.test(id) || !(await getSession())) return notFound();
  const media = await prisma.mediaFile.findUnique({ where: { id } });
  if (!media || media.kind !== "payment_qr") return notFound();
  const body = await readMedia(media).catch(() => null);
  return body ? imageResponse(body, media.contentType, "private, max-age=31536000, immutable") : notFound();
}
