/** Environment shared by integration (Vitest) and end-to-end (Playwright) tests. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://localians:localians@localhost:5433/localians_test";

export const TEST_ENV = {
  DATABASE_URL: TEST_DATABASE_URL,
  BETTER_AUTH_SECRET: "test-secret-for-automated-tests-only-0123456789abcdef",
  BETTER_AUTH_URL: "http://localhost:3123",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3123",
  EMAIL_TRANSPORT: "outbox",
  GITHUB_CLIENT_ID: "",
  GITHUB_CLIENT_SECRET: "",
};
