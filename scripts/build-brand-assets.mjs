// Generates every Localians logo/icon size from the two official source files:
//   public/images/logo/Localians-logo.png     (wordmark, transparent, for dark backgrounds)
//   public/images/logo/Localians-favicon.png  (mark, transparent)
// The design and colours are never changed: assets are resized, placed on canvases, or (for the
// light-background wordmark only) the white letters/globe are re-inked dark so they stay visible.
//
//   node scripts/build-brand-assets.mjs
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const SRC_LOGO = path.join(root, "public/images/logo/Localians-logo.png");
const SRC_MARK = path.join(root, "public/images/logo/Localians-favicon.png");
const OUT = path.join(root, "public/images/logo");
const APP = path.join(root, "src/app");
const INK = { r: 14, g: 18, b: 14 }; // #0e120e, the light theme's text colour

// 256-colour palette with dithering: flat logo art stays visually identical at a fraction of the size.
const png = (s) => s.png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, quality: 95, colours: 256, dither: 0.6 });
const written = [];
async function save(pipeline, file) {
  await png(pipeline).toFile(file);
  written.push(`${path.relative(root, file)} (${fs.statSync(file).size} B)`);
}

// ---------------------------------------------------------------- wordmark
const logoMeta = await sharp(SRC_LOGO).metadata();
const ratio = logoMeta.width / logoMeta.height;

/** The wordmark re-inked for light backgrounds: near-white pixels (letters "Local", globe) → dark ink. */
async function lightWordmark() {
  const { data, info } = await sharp(SRC_LOGO).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    // White/grey family (lime has a low blue channel, so it is never matched).
    if (Math.min(r, g, b) > 150 && Math.max(r, g, b) - Math.min(r, g, b) < 40) {
      data[i] = INK.r;
      data[i + 1] = INK.g;
      data[i + 2] = INK.b;
    }
  }
  return sharp(data, { raw: info });
}

for (const width of [320, 640]) {
  const height = Math.round(width / ratio);
  await save(sharp(SRC_LOGO).resize(width, height, { kernel: "lanczos3" }), path.join(OUT, `localians-logo-${width}.png`));
  await save((await lightWordmark()).resize(width, height, { kernel: "lanczos3" }), path.join(OUT, `localians-logo-light-${width}.png`));
}
// Email: 2x the displayed 180 px width, on the email's dark header (no transparency issues in clients).
await save(sharp(SRC_LOGO).resize(360, Math.round(360 / ratio)).flatten({ background: { r: 17, g: 21, b: 17 } }), path.join(OUT, "localians-logo-email.png"));

// ---------------------------------------------------------------- mark / icons
/** The mark centred on a square canvas (the source is 972×924 — never stretched). */
async function squareMark(size, padding) {
  const inner = Math.round(size * (1 - 2 * padding));
  const mark = await sharp(SRC_MARK).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  return { mark, inner };
}

/** Mark on a dark rounded tile: readable on both light and dark browser tabs. */
async function tile(size, { padding = 0.14, radius = 0.22, rounded = true } = {}) {
  const { mark } = await squareMark(size, padding);
  const r = Math.round(size * radius);
  const shape = rounded
    ? Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#070907"/></svg>`)
    : Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#070907"/></svg>`);
  return sharp(shape).composite([{ input: mark, gravity: "center" }]);
}

// Transparent mark for in-page use (sidebar on small screens, etc.).
await save(sharp(SRC_MARK).resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }), path.join(OUT, "localians-mark-256.png"));

// Next.js App Router conventions: src/app/icon.png, apple-icon.png, favicon.ico.
await save(await tile(512), path.join(APP, "icon.png"));
await save(await tile(180, { rounded: false, padding: 0.16 }), path.join(APP, "apple-icon.png")); // iOS rounds the corners itself

// favicon.ico with PNG-encoded 16/32/48 images (supported by every current browser).
const icoSizes = [16, 32, 48];
const icoImages = await Promise.all(icoSizes.map(async (s) => png(await tile(s, { padding: s <= 16 ? 0.06 : 0.1 })).toBuffer()));
const header = Buffer.alloc(6 + 16 * icoImages.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoImages.length, 4);
let offset = header.length;
icoImages.forEach((img, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(icoSizes[i], e);
  header.writeUInt8(icoSizes[i], e + 1);
  header.writeUInt16LE(1, e + 4); // colour planes
  header.writeUInt16LE(32, e + 6); // bits per pixel
  header.writeUInt32LE(img.length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += img.length;
});
fs.writeFileSync(path.join(APP, "favicon.ico"), Buffer.concat([header, ...icoImages]));
written.push(`src/app/favicon.ico (${fs.statSync(path.join(APP, "favicon.ico")).size} B)`);

// Web app manifest icons (any + maskable; maskable keeps the mark inside the 80% safe zone).
await save(await tile(192), path.join(OUT, "icon-192.png"));
await save(await tile(512), path.join(OUT, "icon-512.png"));
await save(await tile(512, { rounded: false, padding: 0.22 }), path.join(OUT, "icon-maskable-512.png"));

// Gateway pages (password / "preview isn't active") can't load external images: a small inline wordmark.
const inline = await png(sharp(SRC_LOGO).resize(288, Math.round(288 / ratio))).toBuffer();
fs.writeFileSync(path.join(root, "tunnel/gateway/brand.ts"), `// Generated by scripts/build-brand-assets.mjs — the Localians wordmark (288 px wide) for gateway pages.\nexport const LOGO_DATA_URI = "data:image/png;base64,${inline.toString("base64")}";\nexport const LOGO_ASPECT = ${ratio.toFixed(4)};\n`);
written.push(`tunnel/gateway/brand.ts (${inline.length} B image)`);

console.log(written.join("\n"));
