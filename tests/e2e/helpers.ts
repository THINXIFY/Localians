import { expect, type Page } from "@playwright/test";
import pg from "pg";
import { waitForEmailLink } from "../setup/outbox";
import { TEST_DATABASE_URL } from "../setup/test-env";

let n = 0;
export const uniqueEmail = (label = "e2e") => `${label}-${Date.now()}-${++n}@example.test`;
export const PASSWORD = "e2e-password-123";
/** A fresh, valid username (3–24 chars: lowercase letters, digits, underscores; starts with a letter). */
export const uniqueUsername = () => `u${Date.now().toString(36)}_${++n}`.slice(0, 24);

/** Runs a single SQL statement against the test database (for setting up edge cases like expired sessions). */
export async function sql(text: string, values: unknown[] = []) {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    return await client.query(text, values);
  } finally {
    await client.end();
  }
}

/** Full UI sign-up → email verification → lands on onboarding (signed in). */
export async function signUpAndVerify(page: Page, name = "E2E User", email = uniqueEmail()) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Username").fill(uniqueUsername());
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/verify-email\?email=/);

  const link = await waitForEmailLink(email, "verify-email");
  await page.goto(link);
  await expect(page).toHaveURL(/\/onboarding$/);
  return { email, name };
}

/** Signs up, verifies and skips onboarding — ends on the dashboard overview. */
export async function createUserOnDashboard(page: Page, name = "E2E User") {
  const user = await signUpAndVerify(page, name);
  await page.getByRole("button", { name: "Continue to dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return user;
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

export async function createProject(page: Page, values: { name: string; description?: string; framework?: string; port?: string }) {
  await page.goto("/dashboard/projects/new");
  await page.getByLabel("Project name").fill(values.name);
  if (values.description) await page.getByLabel("Description").fill(values.description);
  if (values.framework) await page.getByLabel("Framework").selectOption({ label: values.framework });
  // The form suggests 5173; tests without a port mean "no saved port".
  await page.getByLabel("Default local port").fill(values.port ?? "");
  await page.getByRole("button", { name: "Create project" }).click();
  // Exclude /projects/new itself: wait until the form has navigated to the created project.
  await expect(page).toHaveURL(/\/dashboard\/projects\/(?!new$)[a-z0-9]+$/);
  return page.url().split("/").pop()!;
}

/** Asserts the page has no horizontal scroll. */
export async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, "page should not scroll horizontally").toBeLessThanOrEqual(clientWidth);
}
