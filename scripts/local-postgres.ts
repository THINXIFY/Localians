/**
 * Project-local PostgreSQL for development and tests.
 *
 * Runs real PostgreSQL server binaries (via `embedded-postgres`) with data in
 * `.localians-dev/postgres`, so no system-wide install or Docker is required.
 * Production should use a managed PostgreSQL through DATABASE_URL instead.
 */
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

export const LOCAL_PG = {
  port: 5433,
  user: "localians",
  password: "localians",
  databases: ["localians", "localians_test"],
  dataDir: path.resolve(process.cwd(), ".localians-dev", "postgres"),
};

export function isPortOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

export async function startLocalPostgres({ quiet = false } = {}) {
  const pg = new EmbeddedPostgres({
    databaseDir: LOCAL_PG.dataDir,
    port: LOCAL_PG.port,
    user: LOCAL_PG.user,
    password: LOCAL_PG.password,
    authMethod: "scram-sha-256",
    persistent: true,
    onLog: quiet ? () => {} : (m) => process.stdout.write(`[postgres] ${m}`),
    onError: (e) => console.error("[postgres]", e),
  });

  if (!fs.existsSync(path.join(LOCAL_PG.dataDir, "PG_VERSION"))) {
    fs.mkdirSync(path.dirname(LOCAL_PG.dataDir), { recursive: true });
    await pg.initialise();
  }
  await pg.start();

  const client = pg.getPgClient("postgres", "127.0.0.1");
  await client.connect();
  try {
    for (const name of LOCAL_PG.databases) {
      const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
      if (!rowCount) await client.query(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await client.end();
  }
  return pg;
}

// CLI entry: `npm run db:start` keeps PostgreSQL running until Ctrl+C.
const isEntry = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isEntry) {
  (async () => {
    if (await isPortOpen(LOCAL_PG.port)) {
      console.log(`PostgreSQL is already listening on port ${LOCAL_PG.port}.`);
      return;
    }
    const pg = await startLocalPostgres({ quiet: true });
    console.log(
      `\nLocal PostgreSQL is running on port ${LOCAL_PG.port} (databases: ${LOCAL_PG.databases.join(", ")}).\n` +
        `Data directory: ${LOCAL_PG.dataDir}\nPress Ctrl+C to stop.\n`,
    );
    const stop = async () => {
      await pg.stop();
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    setInterval(() => {}, 1 << 30);
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
