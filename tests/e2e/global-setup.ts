import { prepareTestDatabase } from "../setup/database";

export default async function globalSetup() {
  const stop = await prepareTestDatabase();
  return async () => {
    await stop?.();
  };
}
