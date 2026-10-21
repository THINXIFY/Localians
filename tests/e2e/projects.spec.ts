import { expect, test } from "@playwright/test";
import { createProject, createUserOnDashboard, login } from "./helpers";

test("create, edit, archive, restore and delete a project", async ({ page }) => {
  await createUserOnDashboard(page, "Project Owner");

  // Empty state on the overview
  await expect(page.getByText("No projects yet")).toBeVisible();

  const id = await createProject(page, { name: "E-commerce Website", description: "Storefront for a client", framework: "Next.js", port: "3000" });
  await expect(page.getByRole("heading", { level: 1, name: "E-commerce Website" })).toBeVisible();
  await expect(page.getByText("Storefront for a client")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Project Previews" })).toBeVisible();
  await expect(page.getByText("No previews yet.")).toBeVisible();
  await expect(page.getByText("Start your local app, then share it with Localians to create your first preview.")).toBeVisible();
  await expect(page.getByText(`localians share 3000 --project ${id}`)).toBeVisible();

  // Edit in a dialog (keyboard: Escape closes without saving)
  await page.getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit project" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Edit" }).click();
  await dialog.getByLabel("Project name").fill("Client Dashboard");
  await dialog.getByLabel("Default local port").fill("70000");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog.getByText("Ports range from 1 to 65535.")).toBeVisible();
  await dialog.getByLabel("Default local port").fill("5173");
  await dialog.getByLabel("Framework").selectOption({ label: "React / Vite" });
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Client Dashboard" })).toBeVisible();
  await expect(page.getByText("React / Vite")).toBeVisible();
  await expect(page.getByText("5173", { exact: true })).toBeVisible();

  // Archive → restore
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("This project is archived.")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("This project is archived.")).toBeHidden();

  // Delete requires typing the exact name
  await page.getByRole("button", { name: "Delete project…" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete this project permanently?" });
  const del = confirm.getByRole("button", { name: "Delete permanently" });
  await expect(del).toBeDisabled();
  await confirm.getByRole("textbox").fill("client dashboard");
  await expect(del).toBeDisabled();
  await confirm.getByRole("textbox").fill("Client Dashboard");
  await del.click();
  await expect(page).toHaveURL(/\/dashboard\/projects$/);
  await expect(page.getByText("Create your first project")).toBeVisible();

  await page.goto(`/dashboard/projects/${id}`);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("search, status filters and dashboard counts reflect the database", async ({ page }) => {
  await createUserOnDashboard(page, "Filter Person");
  await createProject(page, { name: "Alpha Store" });
  const betaId = await createProject(page, { name: "Beta Store" });
  await createProject(page, { name: "Gamma API" });
  await page.goto(`/dashboard/projects/${betaId}`);
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("This project is archived.")).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByTestId("stat-Total Projects")).toHaveText("3");
  await expect(page.getByText("2 active · 1 archived")).toBeVisible();
  await expect(page.getByTestId("stat-Active Previews")).toHaveText("0");
  await expect(page.getByTestId("stat-Total Requests")).toHaveText("0");
  await expect(page.getByTestId("stat-Bandwidth Usage")).toHaveText("0 B");

  await page.goto("/dashboard/projects");
  const list = page.getByRole("list", { name: "Projects" });
  await expect(list.getByRole("listitem")).toHaveCount(3);

  await page.getByLabel("Search projects by name").fill("store");
  await expect(page).toHaveURL(/q=store/);
  await expect(list.getByRole("listitem")).toHaveCount(2);

  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await expect(page).toHaveURL(/status=archived/);
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list).toContainText("Beta Store");

  await page.getByLabel("Search projects by name").fill("nothing-matches");
  await expect(page.getByText("No matching projects")).toBeVisible();
});

test("users cannot open each other's projects", async ({ page, browser }) => {
  await createUserOnDashboard(page, "Owner A");
  const projectId = await createProject(page, { name: "Private Thing" });

  const other = await browser.newPage();
  await createUserOnDashboard(other, "Intruder B");
  const res = await other.goto(`/dashboard/projects/${projectId}`);
  expect(res?.status()).toBe(404);
  await expect(other.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(other.getByText("Private Thing")).toHaveCount(0);
  await other.close();
});

test("project data persists across sign-out and sign-in", async ({ page }) => {
  const { email } = await createUserOnDashboard(page, "Persistent Person");
  await createProject(page, { name: "Long-lived App", port: "8080" });
  await page.context().clearCookies();

  await login(page, email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Long-lived App")).toBeVisible();
});

test("new projects suggest port 5173 but keep whatever port is entered", async ({ page }) => {
  await createUserOnDashboard(page, "Port Default");
  await page.goto("/dashboard/projects/new");
  await expect(page.getByLabel("Default local port")).toHaveValue("5173");
  await page.getByLabel("Project name").fill("Default Port App");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/dashboard\/projects\/(?!new$)[a-z0-9]+$/);
  await expect(page.getByText(/localians share 5173 --project/)).toBeVisible();

  // Any other port is kept as entered (and existing projects keep theirs).
  const id = await createProject(page, { name: "Angular App", port: "4200" });
  await page.goto(`/dashboard/projects/${id}`);
  await expect(page.getByText(`localians share 4200 --project ${id}`)).toBeVisible();
  await page.goto("/dashboard/share?port=8080");
  await expect(page.getByTestId("share-command")).toHaveText(/localians share 8080 --setup /);
});
