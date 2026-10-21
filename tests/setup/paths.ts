import path from "node:path";

export { TEST_DATABASE_URL } from "./test-env";

/** Must match OUTBOX_DIR in src/server/email/send.ts (resolved from the project root). */
export const OUTBOX_DIR_PATH = path.resolve(__dirname, "..", "..", ".localians-dev", "outbox");
