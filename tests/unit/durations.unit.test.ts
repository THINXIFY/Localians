import { describe, expect, it } from "vitest";
import { HELP, parseCli } from "@tunnel/cli/args";
import { DURATION_OPTIONS, durationLabel, FREE_MAX_MINUTES, formatRemaining, isDurationOption, parseDuration, PASS_MAX_MINUTES } from "@tunnel/shared/durations";

describe("duration options", () => {
  it("free: 5m–24h, Preview Pass adds 3 and 7 days", () => {
    expect(DURATION_OPTIONS.filter((o) => o.plan === "free").map((o) => o.minutes)).toEqual([5, 15, 30, 60, 720, 1440]);
    expect(DURATION_OPTIONS.filter((o) => o.plan === "pass").map((o) => o.minutes)).toEqual([4320, 10080]);
    expect(Math.max(...DURATION_OPTIONS.filter((o) => o.plan === "free").map((o) => o.minutes))).toBe(FREE_MAX_MINUTES);
    expect(Math.max(...DURATION_OPTIONS.map((o) => o.minutes))).toBe(PASS_MAX_MINUTES);
    for (const bad of [0, 7, 60.5, "60", null, undefined, -60]) expect(isDurationOption(bad)).toBe(false);
    expect(durationLabel(720)).toBe("12 hours");
  });

  it("parses what people type, and only listed options", () => {
    expect(parseDuration("5m")).toBe(5);
    expect(parseDuration("15")).toBe(15);
    expect(parseDuration("1h")).toBe(60);
    expect(parseDuration(" 12 hours ")).toBe(720);
    expect(parseDuration("24H")).toBe(1440);
    expect(parseDuration("1d")).toBe(1440);
    expect(parseDuration("7d")).toBe(10080);
    for (const bad of ["2h", "10m", "1w", "", "abc", "1.5h", "-1h", "999999d"]) expect(parseDuration(bad), bad).toBeNull();
  });

  it("formats countdowns", () => {
    expect(formatRemaining(0)).toBe("0s");
    expect(formatRemaining(-5000)).toBe("0s");
    expect(formatRemaining(45_900)).toBe("45s");
    expect(formatRemaining(14 * 60_000 + 9000)).toBe("14m 09s");
    expect(formatRemaining(2 * 3600_000 + 5 * 60_000)).toBe("2h 05m");
    expect(formatRemaining(3 * 86_400_000 + 4 * 3600_000)).toBe("3d 04h");
  });
});

describe("localians share --duration", () => {
  it("accepts the listed durations and explains the others", () => {
    expect(parseCli(["share", "3000", "--duration", "1h"])).toMatchObject({ kind: "command", options: { durationMinutes: 60 } });
    expect(parseCli(["share", "3000", "-d", "30m"])).toMatchObject({ kind: "command", options: { durationMinutes: 30 } });
    expect(parseCli(["share", "3000"])).toMatchObject({ kind: "command", options: { durationMinutes: undefined } });
    const bad = parseCli(["share", "3000", "--duration", "2h"]);
    expect(bad).toMatchObject({ kind: "error" });
    expect((bad as { message: string }).message).toContain("5m, 15m, 30m, 1h, 12h or 24h");
    expect(parseCli(["status", "--duration", "1h"])).toMatchObject({ kind: "error", message: "--duration only applies to share." });
    expect(HELP).toContain("--duration <time>");
    expect(HELP).toContain("npx localians share 3000 --duration 1h");
  });
});
