import { expect, test } from "@playwright/test";
import { waitForEmailLink } from "../setup/outbox";
import { createUserOnDashboard, login, PASSWORD, signUpAndVerify, sql, uniqueEmail, uniqueUsername } from "./helpers";

test("sign up → verify email → onboarding → first project", async ({ page }) => {
  await signUpAndVerify(page, "Onboard Person");
  await expect(page.getByRole("heading", { name: "Welcome to Localians." })).toBeVisible();
  await expect(page.getByText("Let's get your workspace ready.")).toBeVisible();

  await page.getByLabel("Workspace name", { exact: true }).fill("Onboard Studio");
  await page.getByRole("button", { name: "Add a project" }).click();
  await page.getByLabel("Project name").fill("Launch Site");
  await page.getByLabel("Framework").selectOption({ label: "Next.js" });
  await page.getByLabel("Default local port").fill("3000");
  await page.getByRole("button", { name: "Create project & continue" }).click();

  await expect(page).toHaveURL(/\/dashboard\/projects\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Launch Site" })).toBeVisible();
  await expect(page.getByText("Onboard Studio")).toBeVisible(); // workspace name in the top bar

  // Onboarding is one-time.
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("registration form validates input", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter your name.")).toBeVisible();
  await expect(page.getByText("Enter your email address.")).toBeVisible();

  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByLabel("Confirm password").fill("different");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByText("Use at least 10 characters.")).toBeVisible();
  await expect(page.getByText("Passwords don't match.")).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill("Str0ng-Enough-Phrase!");
  await expect(page.getByText("Password strength: Strong")).toBeVisible();
});

test("unverified users can't sign in", async ({ page }) => {
  const email = uniqueEmail("unverified");
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Not Verified");
  await page.getByLabel("Username").fill(uniqueUsername());
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/verify-email/);

  await login(page, email);
  await expect(page.getByText("Please verify your email first.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("login rejects bad credentials, then succeeds and returns to the intended page", async ({ page, context }) => {
  const { email } = await createUserOnDashboard(page, "Return Person");
  await context.clearCookies();

  await page.goto("/dashboard/projects?status=archived");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fprojects%3Fstatus%3Darchived/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("wrong-password-9");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("That email and password combination is incorrect.")).toBeVisible();

  // Password visibility toggle
  const password = page.getByLabel("Password", { exact: true });
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(password).toHaveAttribute("type", "text");

  await password.fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/projects\?status=archived$/);
});

test("signed-in users are sent from /login and /signup to the dashboard", async ({ page }) => {
  await createUserOnDashboard(page);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/signup");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("sign out ends the session", async ({ page }) => {
  await createUserOnDashboard(page);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login\?reason=signed-out/);
  await expect(page.getByText("You've been signed out.")).toBeVisible();

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
});

test("an expired session redirects to login with an explanation", async ({ page }) => {
  const { email } = await createUserOnDashboard(page);
  await sql(`UPDATE sessions SET "expiresAt" = (now() AT TIME ZONE 'utc') - interval '1 minute' WHERE "userId" = (SELECT id FROM users WHERE email = $1)`, [email]);
  await page.goto("/dashboard/projects");
  await expect(page).toHaveURL(/\/login\?.*reason=expired/);
  await expect(page.getByText("Your session has expired.")).toBeVisible();
});

test("forgot password → email link → reset → sign in with the new password", async ({ page, context }) => {
  const { email } = await createUserOnDashboard(page);
  await context.clearCookies();

  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("a password reset link is on its way")).toBeVisible();

  await page.goto(await waitForEmailLink(email, "reset-password"));
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  await page.getByLabel("New password", { exact: true }).fill("Reset-password-456");
  await page.getByLabel("Confirm new password").fill("Reset-password-456");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("Your password has been updated")).toBeVisible();

  await login(page, email, "Reset-password-456");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("an invalid reset link shows a recovery path", async ({ page }) => {
  await page.goto("/reset-password?error=INVALID_TOKEN");
  await expect(page.getByText("This reset link is invalid or has expired.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/forgot-password");
});

test("GitHub sign-in shows a clear state when not configured", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeDisabled();
  await expect(page.getByText("GitHub sign-in isn't configured on this server yet.")).toBeVisible();
});

test("auth pages reject open redirects in ?next=", async ({ page }) => {
  const { email } = await createUserOnDashboard(page);
  await page.context().clearCookies();
  await page.goto("/login?next=//evil.example/steal");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/localhost:3123\/dashboard$/);
});
