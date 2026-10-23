import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Type-check only the web app: tests, the CLI/gateway and the VS Code extension have their own configs and dependencies.
  typescript: { tsconfigPath: "tsconfig.app.json" },
  async redirects() {
    // Phase 1 placeholder URLs now point at the real auth pages.
    return [
      { source: "/sign-in", destination: "/login", permanent: true },
      { source: "/get-started", destination: "/signup", permanent: true },
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
    ];
  },
};

export default nextConfig;
