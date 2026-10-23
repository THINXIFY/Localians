import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { qrPath } from "@/lib/payment-qr";

const WALLET = "0x2f94b75535eff533378c90f8dda29cf10208b174";

/** Rasterizes the SVG path the way a screen does (white background, black modules) and scans it like a phone would. */
function decode(path: { size: number; d: string }, scale = 6) {
  const px = path.size * scale;
  const rgba = new Uint8ClampedArray(px * px * 4).fill(255);
  for (const m of path.d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    const [x, y, w] = [Number(m[1]), Number(m[2]), Number(m[3])];
    for (let py = y * scale; py < (y + 1) * scale; py++) {
      for (let pxx = x * scale; pxx < (x + w) * scale; pxx++) {
        const i = (py * px + pxx) * 4;
        rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
      }
    }
  }
  return jsQR(rgba, px, px)?.data ?? null;
}

describe("payment QR", () => {
  it("decodes back to exactly the wallet address it was generated from", () => {
    expect(decode(qrPath(WALLET))).toBe(WALLET);
  });

  it("is generated per value: a different address gives a different code that decodes to that address", () => {
    const other = "0x55d398326f99059ff775485246999027b3197955";
    const a = qrPath(WALLET);
    const b = qrPath(other);
    expect(a.d).not.toBe(b.d);
    expect(decode(b)).toBe(other);
  });

  it("includes a quiet zone and stays small", () => {
    const qr = qrPath(WALLET);
    expect(qr.size).toBeGreaterThan(29);
    expect(qr.d.length).toBeLessThan(6000);
    expect(qr.d.startsWith("M")).toBe(true);
  });
});
