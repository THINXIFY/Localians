import "server-only";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import jsQR from "jsqr";
import sharp from "sharp";
import { prisma } from "./db";
import { isDeployedProduction } from "./deployment";

/**
 * Uploaded images (payment QR codes, workspace avatars).
 *
 * Files live in LOCALIANS_UPLOAD_DIR, which must be outside the release directories that deploy.sh replaces (on the
 * VPS: /srv/localians/uploads). They are never served from public/: a route handler streams them after an access
 * check. Every upload is decoded and re-encoded by sharp, so only the pixels survive (no metadata, no embedded
 * payloads), and is written under a server-generated name: nothing from the client ever becomes part of a path.
 */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_INPUT_PIXELS = 4096 * 4096;

export type MediaKind = "payment_qr" | "workspace_avatar";
type Detected = "png" | "jpeg" | "webp";

export class MediaError extends Error {}

export function uploadDir() {
  const configured = process.env.LOCALIANS_UPLOAD_DIR?.trim();
  if (configured) return path.resolve(configured);
  if (isDeployedProduction()) throw new MediaError("Uploads aren't configured on this server (LOCALIANS_UPLOAD_DIR).");
  return path.join(process.cwd(), ".localians-dev", "uploads");
}

/** The real type from the file's first bytes; the extension and the browser's content type are ignored. */
export function detectImageType(bytes: Uint8Array): Detected | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "webp";
  return null;
}

/** Reads and checks an uploaded File: size, real type, and that it decodes as an image of sane dimensions. */
async function readImage(file: File) {
  if (!(file instanceof File)) throw new MediaError("Choose an image to upload.");
  if (file.size === 0) throw new MediaError("That file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new MediaError("Images can be up to 2 MB.");
  const input = Buffer.from(await file.arrayBuffer());
  const type = detectImageType(input);
  if (!type) throw new MediaError("Upload a PNG, JPEG or WebP image.");
  try {
    const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).metadata();
    if (meta.format !== type) throw new MediaError("The file's contents don't match an image type we accept.");
    if (!meta.width || !meta.height || meta.width < 32 || meta.height < 32) throw new MediaError("The image is too small (at least 32 × 32 pixels).");
    if ((meta.pages ?? 1) > 1) throw new MediaError("Animated images aren't supported.");
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError("That image couldn't be read. Upload a PNG, JPEG or WebP image.");
  }
  return input;
}

/** Decodes a QR code from an image (for payment QR uploads). Returns the text it contains, or null. */
export async function decodeQr(input: Buffer) {
  const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().flatten({ background: "#ffffff" }).resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height)?.data ?? null;
}

async function store(kind: MediaKind, output: Buffer, ext: "png" | "webp", extra: { workspaceId?: string | null; qrData?: string | null; createdById: string }) {
  const meta = await sharp(output).metadata();
  const storageKey = `${kind === "payment_qr" ? "qr" : "ws"}-${randomBytes(16).toString("hex")}.${ext}`;
  const dir = uploadDir();
  await fs.mkdir(dir, { recursive: true, mode: 0o750 });
  // "wx": never overwrite an existing file, even with a (practically impossible) name collision.
  await fs.writeFile(path.join(dir, storageKey), output, { flag: "wx", mode: 0o640 });
  try {
    return await prisma.mediaFile.create({
      data: {
        kind,
        storageKey,
        contentType: ext === "png" ? "image/png" : "image/webp",
        bytes: output.length,
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        sha256: createHash("sha256").update(output).digest("hex"),
        workspaceId: extra.workspaceId ?? null,
        qrData: extra.qrData ?? null,
        createdById: extra.createdById,
      },
    });
  } catch (error) {
    await fs.unlink(path.join(dir, storageKey)).catch(() => undefined);
    throw error;
  }
}

/** A workspace avatar: square-cropped to 256 × 256 WebP. */
export async function saveWorkspaceAvatar(file: File, workspaceId: string, userId: string) {
  const input = await readImage(file);
  const output = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().resize(256, 256, { fit: "cover", position: "attention" }).webp({ quality: 86 }).toBuffer();
  return store("workspace_avatar", output, "webp", { workspaceId, createdById: userId });
}

/**
 * A payment QR image, accepted only if it decodes to `expected` (the configured wallet address). Plain addresses and
 * `ethereum:`/`bnb:` style URIs that carry exactly that address are accepted; anything else is rejected.
 */
export async function savePaymentQr(file: File, expected: string, adminId: string) {
  const input = await readImage(file);
  const decoded = await decodeQr(input);
  if (!decoded) throw new MediaError("No QR code could be read from that image. Upload a clear, uncropped QR code.");
  const address = qrAddress(decoded);
  if (!address) throw new MediaError("The QR code doesn't contain a wallet address.");
  if (address !== expected.toLowerCase()) throw new MediaError(`The QR code points to ${address}, not the configured wallet ${expected}. It was not saved.`);
  const output = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().flatten({ background: "#ffffff" }).resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  // Re-check the image we'll actually serve.
  if (qrAddress((await decodeQr(output)) ?? "") !== expected.toLowerCase()) throw new MediaError("The QR code couldn't be read reliably after processing. Upload a larger, sharper image.");
  return store("payment_qr", output, "png", { qrData: address, createdById: adminId });
}

/** The 0x address inside QR content: a bare address, or a payment URI whose target is exactly one address. */
export function qrAddress(content: string) {
  const text = content.trim();
  const bare = /^0x[0-9a-fA-F]{40}$/.exec(text);
  if (bare) return text.toLowerCase();
  const uri = /^(?:ethereum|bnb|bsc|binance):(0x[0-9a-fA-F]{40})(?:@\d+)?(?:[/?].*)?$/i.exec(text);
  return uri ? uri[1].toLowerCase() : null;
}

/** Reads a stored file by its media row (the storage key is server-generated and re-validated here). */
export async function readMedia(media: { storageKey: string }) {
  if (!/^[a-z0-9_-]+\.(png|jpg|webp)$/.test(media.storageKey)) throw new MediaError("Invalid media.");
  return fs.readFile(path.join(uploadDir(), media.storageKey));
}

/** Removes a media row and its file (best effort on the file: a missing file is fine). */
export async function deleteMedia(id: string | null | undefined) {
  if (!id) return;
  const media = await prisma.mediaFile.findUnique({ where: { id } });
  if (!media) return;
  await prisma.mediaFile.delete({ where: { id } });
  if (/^[a-z0-9_-]+\.(png|jpg|webp)$/.test(media.storageKey)) await fs.unlink(path.join(uploadDir(), media.storageKey)).catch(() => undefined);
}
