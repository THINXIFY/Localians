import { expect, test } from "@playwright/test";
import { createProject, createUserOnDashboard, expectNoHorizontalOverflow } from "./helpers";

test("a new user is pointed straight at sharing, with honest empty states", async ({ page }) => {
  await createUserOnDashboard(page, "Fresh Sharer");

  // Overview answers: what it does, how to connect, how to get a link, how to stop.
  await expect(page.getByRole("heading", { name: "Your localhost. Ready to share.", level: 1 })).toBeVisible();
  const how = page.getByRole("list", { name: "How Localians works" });
  for (const title of ["What it does", "Connect your app", "Get a link", "Stop sharing"]) await expect(how.getByRole("heading", { name: title })).toBeVisible();
  await expect(how).toContainText("localians share 5173");
  await expect(page.getByRole("link", { name: "View My Previews" })).toHaveAttribute("href", "/dashboard/previews");

  // Sidebar: Share App first, then previews and projects; Connection Help is one click away.
  const nav = page.getByRole("navigation", { name: "Dashboard" });
  await expect(nav.getByRole("link", { name: "Connection Help" })).toHaveAttribute("href", "/docs/troubleshooting");
  await nav.getByRole("link", { name: "Share App" }).click();
  await expect(page).toHaveURL(/\/dashboard\/share$/);
  for (const step of ["Enter your port", "Copy the command", "Share your link"]) {
    await expect(page.getByRole("heading", { name: step })).toBeVisible();
  }
  // 5173 is only the suggested starting port.
  await expect(page.getByLabel("Port", { exact: true })).toHaveValue("5173");
  await expect(page.getByTestId("share-command")).toHaveText(/localians share 5173 --setup [a-z2-9]{12}$/);
  await expect(page.getByText("Waiting for your local app to connect...")).toBeVisible();
  await page.getByLabel("Port", { exact: true }).fill("8080");
  await expect(page.getByTestId("share-command")).toHaveText(/localians share 8080 --setup [a-z2-9]{12}$/);
  await page.getByLabel("Port", { exact: true }).fill("99999");
  await expect(page.getByText("Enter the port number your dev server printed (1–65535).")).toBeVisible();
  await page.goto("/dashboard/share?port=4200");
  await expect(page.getByTestId("share-command")).toHaveText(/localians share 4200 --setup [a-z2-9]{12}$/);
  // The beta install is offered (collapsed) because the npm package isn't published.
  await page.getByText("Don't have the Localians command yet?").click();
  await expect(page.getByText("npm install; npm run tunnel:build")).toBeVisible();

  await nav.getByRole("link", { name: "Live Previews" }).click();
  await expect(page.getByRole("heading", { name: "Live Previews", level: 1 })).toBeVisible();
  await expect(page.getByText("Nothing shared yet.")).toBeVisible();
  for (const label of ["Active Previews", "Total Sessions", "Requests Served"]) await expect(page.getByTestId(`stat-${label}`)).toHaveText("0");
  await expect(page.getByTestId("stat-Bandwidth Transferred")).toHaveText("0 B");
  await page.getByRole("main").getByRole("link", { name: "Share a Local App" }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/share$/);

  // The Phase 3 placeholder URL redirects.
  await page.goto("/dashboard/live-previews");
  await expect(page).toHaveURL(/\/dashboard\/previews$/);

  await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "Analytics" }).click();
  await expect(page.getByRole("heading", { name: "Analytics", level: 1 })).toBeVisible();
  await expect(page.getByText("Understand how your development previews are being used.")).toBeVisible();
  await expect(page.getByText("No activity yet.")).toBeVisible();
  await expect(page.getByText("Your preview activity will appear here once you start sharing a local application.")).toBeVisible();
  await expect(page.getByTestId("stat-Total Requests")).toHaveText("0");

  // Range filters live in the URL; an invalid custom range explains itself.
  await page.getByRole("button", { name: "Last 30 days" }).click();
  await expect(page).toHaveURL(/range=30d/);
  await page.goto("/dashboard/analytics?range=custom&from=2026-02-10&to=2026-02-01");
  await expect(page.getByText("The start date must be on or before the end date. Showing the last 7 days instead.")).toBeVisible();

  // Another account's session id is a plain 404.
  await page.goto("/dashboard/previews/does-not-exist");
  await expect(page.getByRole("heading", { name: /not found|doesn.t exist/i })).toBeVisible();
});

test("a project without a saved port gets guidance instead of an invented port", async ({ page }) => {
  await createUserOnDashboard(page, "Portless");
  const id = await createProject(page, { name: "No Port Project" });
  await page.goto(`/dashboard/projects/${id}`);
  await expect(page.getByText("No previews yet.")).toBeVisible();
  await expect(page.getByText(`localians share <port> --project ${id}`)).toBeVisible();
  await expect(page.getByText(/This project has no saved port/)).toBeVisible();
});

test("documentation pages load, link to each other, and have no broken internal links", async ({ page, request }) => {
  const pages = ["/docs", "/docs/getting-started", "/docs/cli", "/docs/frameworks", "/docs/troubleshooting", "/docs/security"];
  const seen = new Set<string>();
  for (const path of pages) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expectNoHorizontalOverflow(page);
    const hrefs = await page.locator("main a[href^='/']").evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
    for (const href of hrefs) seen.add(href.split("#")[0]);
  }
  await page.goto("/docs/getting-started");
  await expect(page.getByRole("heading", { name: "Share your first localhost app in 60 seconds.", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy command" }).first()).toBeVisible();
  await page.goto("/docs/security");
  await expect(page.getByText("Public previews can be opened by anyone with the link.").first()).toBeVisible();
  for (const href of seen) {
    if (href.startsWith("/dashboard")) continue; // needs a session; covered elsewhere
    expect((await request.get(href)).status(), href).toBe(200);
  }
});

test("project preview access: validation, password protection, sign out visitors", async ({ page }) => {
  await createUserOnDashboard(page, "Access Owner");
  const id = await createProject(page, { name: "Protected Project", port: "3000" });
  await page.goto(`/dashboard/projects/${id}`);
  const panel = page.locator("#access");
  await expect(panel.getByRole("heading", { name: "Preview access" })).toBeVisible();
  await expect(panel.getByText("Public previews can be opened by anyone with the link. Enable password protection to restrict access.")).toBeVisible();

  await panel.getByText("Password protected", { exact: true }).click();
  await panel.getByLabel("Password", { exact: true }).fill("short");
  await panel.getByRole("button", { name: "Save access" }).click();
  await expect(panel.getByText("Use at least 8 characters.")).toBeVisible();

  await panel.getByLabel("Password", { exact: true }).fill("client password 1");
  await panel.getByLabel("Visitors stay signed in for").selectOption("480");
  await panel.getByRole("button", { name: "Save access" }).click();
  await expect(page.getByText("Password protection saved.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Sign out all visitors" })).toBeVisible();
  await expect(panel.getByLabel("New password")).toBeVisible(); // can be changed later, optional

  await panel.getByRole("button", { name: "Sign out all visitors" }).click();
  await expect(page.getByText("All visitors were signed out.")).toBeVisible();

  // The wizard picks up the project's protection when its port is chosen.
  await page.goto("/dashboard/share?port=3000");
  await expect(page.getByRole("radio", { name: "Password" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByPlaceholder("Keep the current password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy Command" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
