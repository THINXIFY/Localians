import { describe, expect, it } from "vitest";
import { parseCli } from "@tunnel/cli/args";
import { isLoopback, parsePort } from "@tunnel/cli/local";
import { loadGatewayConfig } from "@tunnel/gateway/config";
import { RateLimiter, ReplayGuard } from "@tunnel/gateway/limits";
import { errorPage } from "@tunnel/gateway/pages";
import { backoffDelay } from "@tunnel/shared/backoff";
import { redactHeaders, redactPath, sanitizeRequestHeaders, sanitizeResponseHeaders, stripLocaliansCookies } from "@tunnel/shared/headers";
import { LABEL_PATTERN } from "@tunnel/shared/protocol";
import { generateCliToken, generatePreviewLabel, generateUserCode, normalizeUserCode, sha256 } from "@/server/cli/crypto";
import { clientIp } from "@/server/rate-limit";

describe("CLI argument parsing", () => {
  it("parses share with a port and options", () => {
    expect(parseCli(["share", "3000", "--project", "shop", "--host-header", "preserve", "-v"])).toEqual({
      kind: "command",
      command: "share",
      port: 3000,
      options: { apiUrl: undefined, project: "shop", hostHeader: "preserve", browser: true, verbose: true, yes: false, newProject: false, name: undefined },
    });
  });

  it.each([
    [["share"], /Usage: localians share/],
    [["share", "abc"], /isn't a valid port/],
    [["share", "0"], /isn't a valid port/],
    [["share", "65536"], /isn't a valid port/],
    [["share", "3000", "4000"], /Usage/],
    [["deploy"], /Unknown command/],
    [["share", "3000", "--host-header", "x"], /host-header/],
    [["login", "--api-url", "ftp://x"], /api-url/],
    [["share", "3000", "--bogus"], /bogus/],
    [["status", "extra"], /doesn't take arguments/],
  ])("rejects %j", (argv, message) => {
    const result = parseCli(argv as string[]);
    expect(result.kind).toBe("error");
    expect((result as { message: string }).message).toMatch(message);
  });

  it("handles help and version", () => {
    expect(parseCli([]).kind).toBe("help");
    expect(parseCli(["--help"]).kind).toBe("help");
    expect(parseCli(["--version"]).kind).toBe("version");
  });

  it("accepts every valid TCP port, not just common dev ports", () => {
    for (const p of ["1", "80", "3000", "4200", "5173", "8080", "65535"]) expect(parsePort(p)).toBe(Number(p));
    for (const p of ["0", "-1", "65536", "3e3", "30.0", " ", ""]) expect(parsePort(p)).toBeNull();
  });

  it("only treats loopback hosts as loopback", () => {
    for (const h of ["localhost", "127.0.0.1", "127.1.2.3", "::1", "[::1]"]) expect(isLoopback(h)).toBe(true);
    for (const h of ["192.168.1.10", "10.0.0.1", "169.254.169.254", "example.com", "0.0.0.0", "localhost.evil.com"]) expect(isLoopback(h)).toBe(false);
  });
});

describe("header filtering", () => {
  const forwarding = { clientIp: "203.0.113.9", host: "abcdefghijkl.preview.test", proto: "https" as const };

  it("strips hop-by-hop, Connection-listed, spoofed forwarding and internal headers", () => {
    const out = sanitizeRequestHeaders(
      {
        host: "abcdefghijkl.preview.test",
        connection: "keep-alive, x-secret-hop",
        "keep-alive": "timeout=5",
        "transfer-encoding": "chunked",
        upgrade: "h2c",
        te: "trailers",
        "proxy-authorization": "Basic Zm9v",
        "x-secret-hop": "1",
        "x-forwarded-for": "1.2.3.4",
        "x-forwarded-host": "evil.example",
        forwarded: "for=1.2.3.4",
        "x-real-ip": "1.2.3.4",
        "x-localians-upgrade": "websocket",
        "x-localians-original-host": "evil",
        accept: "text/html",
        "x-custom": "kept",
      },
      forwarding,
    );
    for (const h of ["host", "connection", "keep-alive", "transfer-encoding", "upgrade", "te", "proxy-authorization", "x-secret-hop", "x-real-ip", "x-localians-upgrade", "x-localians-original-host"]) {
      expect(out).not.toHaveProperty(h);
    }
    expect(out["x-forwarded-for"]).toBe("203.0.113.9");
    expect(out["x-forwarded-host"]).toBe("abcdefghijkl.preview.test");
    expect(out["x-forwarded-proto"]).toBe("https");
    expect(out.forwarded).toBe("for=203.0.113.9;host=abcdefghijkl.preview.test;proto=https");
    expect(out.accept).toBe("text/html");
    expect(out["x-custom"]).toBe("kept");
  });

  it("removes Localians dashboard cookies but keeps the app's own cookies", () => {
    expect(stripLocaliansCookies("localians.session_token=abc; theme=dark; __Secure-localians.session_data=x; sid=1")).toBe("theme=dark; sid=1");
    expect(stripLocaliansCookies("localians.session_token=abc")).toBeUndefined();
    const out = sanitizeRequestHeaders({ cookie: "localians.session_token=abc; cart=3" }, forwarding);
    expect(out.cookie).toBe("cart=3");
  });

  it("strips connection-level headers from responses", () => {
    const out = sanitizeResponseHeaders({ connection: "close", "transfer-encoding": "chunked", "content-type": "text/html", "set-cookie": ["a=1", "b=2"], "x-localians-error": "x" });
    expect(out).toEqual({ "content-type": "text/html", "set-cookie": ["a=1", "b=2"] });
  });

  it("redacts credentials and query strings in logs", () => {
    expect(redactHeaders({ authorization: "Bearer lcl_secret", cookie: "a=1", accept: "*/*" })).toEqual({ authorization: "[redacted]", cookie: "[redacted]", accept: "*/*" });
    expect(redactPath("/reset?token=abc")).toBe("/reset?[redacted]");
    expect(redactPath("/plain")).toBe("/plain");
  });
});

describe("reconnect backoff", () => {
  it("grows exponentially, is capped, and is jittered", () => {
    expect(backoffDelay(0, { random: () => 1 })).toBe(1000);
    expect(backoffDelay(3, { random: () => 1 })).toBe(8000);
    expect(backoffDelay(20, { random: () => 1 })).toBe(30_000);
    expect(backoffDelay(5, { random: () => 0 })).toBe(250); // floor
    const samples = new Set(Array.from({ length: 50 }, () => backoffDelay(4)));
    expect(samples.size).toBeGreaterThan(10);
  });
});

describe("identifiers and tokens", () => {
  it("generates unpredictable, unique, pattern-conforming preview labels", () => {
    const labels = new Set(Array.from({ length: 5000 }, generatePreviewLabel));
    expect(labels.size).toBe(5000);
    for (const l of [...labels].slice(0, 100)) expect(l).toMatch(LABEL_PATTERN);
  });

  it("generates and normalises RFC 8628 user codes", () => {
    const code = generateUserCode();
    expect(code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{8}$/);
    expect(normalizeUserCode(`${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`)).toBe(code);
    expect(normalizeUserCode("AEIO-UUUU")).toBeNull();
    expect(normalizeUserCode("short")).toBeNull();
  });

  it("stores only a hash of CLI tokens", () => {
    const { token, hash, prefix } = generateCliToken();
    expect(token).toMatch(/^lcl_[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(sha256(token));
    expect(hash).not.toContain(token.slice(4));
    expect(token.startsWith(prefix)).toBe(true);
  });
});

describe("control-plane rate limiting", () => {
  it("keys on the proxy-appended (rightmost) X-Forwarded-For entry, not the spoofable leftmost", () => {
    const req = (xff?: string) => new Request("http://x", { headers: xff ? { "x-forwarded-for": xff } : {} });
    expect(clientIp(req("6.6.6.6, 203.0.113.5"))).toBe("203.0.113.5");
    expect(clientIp(req("203.0.113.5"))).toBe("203.0.113.5");
    expect(clientIp(req())).toBe("unknown");
  });
});

describe("gateway limits", () => {
  it("rate limiter allows a burst then refills over time", () => {
    const limiter = new RateLimiter(2, 2);
    expect(limiter.take("k", 0)).toBe(true);
    expect(limiter.take("k", 0)).toBe(true);
    expect(limiter.take("k", 0)).toBe(false);
    expect(limiter.take("k", 600)).toBe(true);
    expect(limiter.take("other", 0)).toBe(true);
  });

  it("connect tokens can be used only once", () => {
    const guard = new ReplayGuard();
    expect(guard.use("jti-1", 10_000, 0)).toBe(true);
    expect(guard.use("jti-1", 10_000, 1)).toBe(false);
    expect(guard.use("jti-1", 10_000, 20_000)).toBe(true); // forgotten after expiry
  });

  it("error pages never reflect request data", () => {
    const page = errorPage("not-found");
    expect(page.status).toBe(404);
    expect(page.html).not.toMatch(/<script/i);
  });

  it("refuses to start without secrets", () => {
    expect(() => loadGatewayConfig({}, () => "")).toThrow(/TUNNEL_TOKEN_SECRET/);
    expect(() =>
      loadGatewayConfig({ TUNNEL_TOKEN_SECRET: "short", GATEWAY_API_SECRET: "x".repeat(40) }, () => ""),
    ).toThrow(/at least 32/);
  });
});
