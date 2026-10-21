import { execSync } from "node:child_process";
import fs from "node:fs";
import pg from "pg";
import { isPortOpen, LOCAL_PG, startLocalPostgres } from "../../scripts/local-postgres";
import { OUTBOX_DIR_PATH, TEST_DATABASE_URL } from "./paths";

/**
 * Ensures PostgreSQL is reachable (starting the project-local server if needed),
 * applies migrations to the test database and empties every table.
 * Returns a stop function when this call started PostgreSQL itself.
 */
export async function prepareTestDatabase() {
  let stop: (() => Promise<void>) | undefined;
  const usingLocal = TEST_DATABASE_URL.includes(`:${LOCAL_PG.port}/`);
  if (usingLocal && !(await isPortOpen(LOCAL_PG.port))) {
    const server = await startLocalPostgres({ quiet: true });
    stop = () => server.stop();
  }

  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });

  await truncateAll();
  fs.rmSync(OUTBOX_DIR_PATH, { recursive: true, force: true });
  return stop;
}

export async function truncateAll() {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
    );
    if (rows.length) await client.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  } finally {
    await client.end();
  }
}
