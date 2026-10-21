import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5174,
    strictPort: true,
    // Localians rewrites Host to localhost:<port> by default, so Vite's host check passes
    // without disabling it. If you use `--host-header preserve`, add your preview domain:
    // allowedHosts: [".preview.localhost"],
  },
});
