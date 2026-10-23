import qrcode from "qrcode-generator";

/** A QR code as one SVG path: `size` modules square (including the quiet zone), dark modules filled by `d`. */
export type QrPath = { size: number; d: string };

const QUIET_ZONE = 4;

/**
 * Encodes `text` as a QR code (byte mode, error correction M) and returns it as an SVG path, so the code is always
 * generated from the configured value itself, never from a separate image file that could drift or go missing.
 * Horizontal runs of dark modules become one rectangle each, which keeps the markup small.
 */
export function qrPath(text: string): QrPath {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const count = qr.getModuleCount();
  let d = "";
  for (let y = 0; y < count; y++) {
    let x = 0;
    while (x < count) {
      if (!qr.isDark(y, x)) {
        x++;
        continue;
      }
      const start = x;
      while (x < count && qr.isDark(y, x)) x++;
      d += `M${start + QUIET_ZONE} ${y + QUIET_ZONE}h${x - start}v1h-${x - start}z`;
    }
  }
  return { size: count + QUIET_ZONE * 2, d };
}
