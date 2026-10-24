import { expect, test, type Browser } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createUserOnDashboard } from "../e2e/helpers";
import { configDir, runCli } from "./cli";
import { TUNNEL_E2E } from "./env";

// Users who still run the previously published CLI keep working against this backend, and upgrading keeps their login.
// Opt-in: point LOCALIANS_COMPAT_CLI at that version's dist/localians.js, e.g. from `npm pack localians@0.1.0`.
const OLD_CLI = process.env.LOCALIANS_COMPAT_CLI;
test.skip(!OLD_CLI || !fs.existsSync(OLD_CLI), "set LOCALIANS_COMPAT_CLI to an older CLI bundle");

const nextApp = path.join(TUNNEL_E2E.root, "examples/next-app");
const viteApp = path.join(TUNNEL_E2E.root, "examples/vite-app");
const LINK = /Preview link\s+(https:\/\/[a-z2-7]{12}\.preview\.localhost:8643)/;

async function visit(browser: Browser, url: string) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const status = (await (await context.newPage()).goto(url))?.status();
  await context.close();
  return status;
}

test("the previous CLI release: login, parallel shares, --project, status, same-port takeover, then upgrade keeps the login", async ({ page, browser }) => {
  const old = (args: string[], cwd = TUNNEL_E2E.root) => runCli(args, cwd, OLD_CLI!);
  await createUserOnDashboard(page, "Old Cli User");

  const login = old(["login", "--no-browser"]);
  const [verifyUrl] = await login.waitFor(/http:\/\/localhost:3123\/cli\/activate\?code=\S+/);
  await page.goto(verifyUrl);
  await page.getByRole("button", { name: "Authorize CLI" }).click();
  await expect(page.getByRole("heading", { name: "CLI authorized" })).toBeVisible();
  expect(await login.exited).toBe(0);
  expect(login.output).toMatch(/Logged in as e2e-/);

  // Two apps at once with the old CLI (the second under an explicit --project).
  const next = old(["share", "4310", "--yes"], nextApp);
  const [, nextUrl] = await next.waitFor(LINK, 60_000);
  const vite = old(["share", "5174", "--yes"], viteApp);
  const [, viteUrl] = await vite.waitFor(LINK, 60_000);
  expect(await visit(browser, nextUrl)).toBe(200);
  expect(await visit(browser, viteUrl)).toBe(200);
  const status = old(["status"]);
  expect(await status.exited).toBe(0);
  expect(status.output).toContain(nextUrl);
  expect(status.output).toContain(viteUrl);
  vite.proc.kill();
  await vite.exited;
  const byProject = old(["share", "5174", "--project", "vite-app"], viteApp);
  const [, projectUrl] = await byProject.waitFor(LINK, 60_000);
  expect(await visit(browser, projectUrl)).toBe(200);

  // The old CLI has no local same-port check: a second share of 4310 takes over from the first, which says so.
  const again = old(["share", "4310", "--yes"], nextApp);
  const [, againUrl] = await again.waitFor(LINK, 60_000);
  await next.waitFor(/A newer share of localhost:4310 from this computer took over/, 30_000);
  expect(await visit(browser, againUrl)).toBe(200);
  expect(await visit(browser, projectUrl)).toBe(200); // the other port is untouched

  // Upgrading: the new CLI uses the saved login as is.
  const whoami = runCli(["whoami"]);
  expect(await whoami.exited).toBe(0);
  expect(whoami.output).toMatch(/Signed in as (@\S+ \()?e2e-/);
  expect(fs.readFileSync(path.join(configDir, "credentials.json"), "utf8")).toMatch(/"username"/); // refreshed from the server

  for (const p of [again, byProject]) p.proc.kill();
  await Promise.all([again.exited, byProject.exited]);
  const logout = runCli(["logout"]);
  expect(await logout.exited).toBe(0);
});
