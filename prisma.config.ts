import { defineConfig } from "prisma/config";

// Local development reads `.env`. In production the environment comes from /etc/localians/*.env (systemd or the
// deploy script), so a missing file is expected. Values already in the environment always win.
// Node's built-in loader means this file needs no package besides `prisma` itself.
try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
