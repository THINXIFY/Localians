import { describe, expect, it } from "vitest";
import { DEFAULT_OFFER, makeOffer, parsePassDays, parseUsdPrice } from "@/lib/offer";

describe("Preview Pass offer", () => {
  it("formats the default and custom offers consistently", () => {
    expect(DEFAULT_OFFER).toMatchObject({ priceMicros: "5000000", days: 7, priceLabel: "$5", usdtLabel: "5 USDT", name: "7-Day Preview Pass", shortName: "7-Day Pass", daysLabel: "7 days", moreLabel: "7 more days" });
    expect(makeOffer(4_990_000n, 1)).toMatchObject({ priceLabel: "$4.99", usdtLabel: "4.99 USDT", name: "1-Day Preview Pass", daysLabel: "1 day", moreLabel: "1 more day" });
    expect(makeOffer("12500000", 30)).toMatchObject({ priceLabel: "$12.50", usdtLabel: "12.50 USDT" });
  });

  it("parses admin prices in whole cents, 1:1 into USDT micro-units, within limits", () => {
    expect(parseUsdPrice("5")).toEqual({ ok: true, micros: 5_000_000n });
    expect(parseUsdPrice(" $4.99 ")).toEqual({ ok: true, micros: 4_990_000n });
    expect(parseUsdPrice("12.5")).toEqual({ ok: true, micros: 12_500_000n });
    for (const bad of ["", "abc", "4.999", "-5", "5,00", "1e3", "0.50", "500.01", "10000"]) expect(parseUsdPrice(bad).ok, bad).toBe(false);
    expect(parseUsdPrice("500")).toEqual({ ok: true, micros: 500_000_000n });
  });

  it("parses pass lengths of 1 to 60 whole days", () => {
    expect(parsePassDays("7")).toEqual({ ok: true, days: 7 });
    expect(parsePassDays(60)).toEqual({ ok: true, days: 60 });
    for (const bad of ["0", "61", "7.5", "", "seven", "-1"]) expect(parsePassDays(bad).ok, bad).toBe(false);
  });
});
