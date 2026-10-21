import { prepareTestDatabase } from "./database";

export default async function setup() {
  const stop = await prepareTestDatabase();
  return async () => {
    await stop?.();
  };
}
