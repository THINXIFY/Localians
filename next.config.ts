import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Type-check only the web app: tests, the CLI/gateway and the VS Code extension have their own configs and dependencies.
  typescript: { tsconfigPath: "tsconfig.app.json" },
  // Image uploads (workspace avatars, payment QR codes) are up to 2 MB, sent through server actions (which keep
  // Next.js's built-in origin/CSRF check). The files themselves are limited and validated again on the server.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  async redirects() {
    // Phase 1 placeholder URLs now point at the real auth pages.
    return [
      { source: "/sign-in", destination: "/login", permanent: true },
      { source: "/get-started", destination: "/signup", permanent: true },
      // The privacy policy lives at /privacy-policy; the old short URL (linked from earlier sign-up pages) keeps working.
      { source: "/privacy", destination: "/privacy-policy", permanent: true },
      // Phase 3 placeholder route.
      { source: "/dashboard/live-previews", destination: "/dashboard/previews", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      // Never in search results: the signed-in app, sign-in flows, CLI approval and every API response.
      ...["/dashboard", "/dashboard/:path*", "/onboarding", "/cli/:path*", "/api/:path*", "/login", "/forgot-password", "/reset-password", "/verify-email", "/username", "/admin", "/admin/:path*"].map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      })),
    ];
  },
};

export default nextConfig;
