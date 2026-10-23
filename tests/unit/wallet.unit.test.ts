import { describe, expect, it, vi } from "vitest";
import { checkBscAddress, toChecksumAddress } from "@/lib/wallet";

vi.mock("server-only", () => ({}));
const { detectImageType, qrAddress } = await import("@/server/media");

describe("BNB Smart Chain address validation", () => {
  it("matches the EIP-55 reference vectors", () => {
    for (const a of ["0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359", "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB", "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb"]) {
      expect(toChecksumAddress(a.toLowerCase())).toBe(a);
      expect(checkBscAddress(a)).toMatchObject({ ok: true, address: a.toLowerCase(), checksum: a });
    }
  });

  it("accepts unchecksummed (single-case) addresses and stores them lowercase", () => {
    expect(checkBscAddress("  0x2f94b75535eff533378c90f8dda29cf10208b174 ")).toMatchObject({ ok: true, address: "0x2f94b75535eff533378c90f8dda29cf10208b174" });
    expect(checkBscAddress("0x2F94B75535EFF533378C90F8DDA29CF10208B174")).toMatchObject({ ok: true, address: "0x2f94b75535eff533378c90f8dda29cf10208b174" });
  });

  it("rejects a mistyped checksum, bad formats and the zero address", () => {
    expect(checkBscAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD")).toMatchObject({ ok: false, error: expect.stringContaining("checksum") });
    for (const bad of ["", "0x123", "5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", "0xZZaeb6053F3E94C9b9A09f33669435E7Ef1BeAed", "bnb1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"]) {
      expect(checkBscAddress(bad).ok, bad).toBe(false);
    }
    expect(checkBscAddress("0x0000000000000000000000000000000000000000")).toMatchObject({ ok: false, error: expect.stringContaining("zero address") });
  });
});

describe("upload checks", () => {
  it("detects the real image type from magic bytes, never the name or browser type", () => {
    expect(detectImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe("png");
    expect(detectImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(detectImageType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("webp");
    expect(detectImageType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(detectImageType(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(detectImageType(new Uint8Array(0))).toBeNull();
  });

  it("reads the wallet from QR content: a bare address or a payment URI for exactly one address", () => {
    expect(qrAddress("0x2F94b75535eff533378c90f8dda29cf10208b174")).toBe("0x2f94b75535eff533378c90f8dda29cf10208b174");
    expect(qrAddress("ethereum:0x2f94b75535eff533378c90f8dda29cf10208b174@56?value=0")).toBe("0x2f94b75535eff533378c90f8dda29cf10208b174");
    expect(qrAddress("https://evil.example/0x2f94b75535eff533378c90f8dda29cf10208b174")).toBeNull();
    expect(qrAddress("0x2f94b75535eff533378c90f8dda29cf10208b174 0x1111111111111111111111111111111111111111")).toBeNull();
    expect(qrAddress("hello")).toBeNull();
  });
});
