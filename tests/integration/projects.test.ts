import { PrismaPg } from "@prisma/adapter-pg";
import { beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { projectInputSchema } from "@/lib/validation/project";
import { prisma } from "@/server/db";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import * as projects from "@/server/projects";
import { getCurrentWorkspace, updateWorkspace } from "@/server/workspaces";
import { createVerifiedUser } from "./helpers";

const input = (overrides: Partial<Record<"name" | "description" | "framework" | "defaultPort", string>> = {}) =>
  projectInputSchema.parse({ name: "E-commerce Website", description: "", framework: "NEXTJS", defaultPort: "3000", ...overrides });

let alice: { id: string };
let bob: { id: string };

beforeAll(async () => {
  alice = (await createVerifiedUser("Alice Example")).user;
  bob = (await createVerifiedUser("Bob Example")).user;
});

describe("project CRUD", () => {
  it("creates a project in the user's workspace with a unique slug", async () => {
    const a = await projects.createProject(alice.id, input({ name: "Client Dashboard" }));
    const b = await projects.createProject(alice.id, input({ name: "Client Dashboard" }));
    expect(a.slug).toBe("client-dashboard");
    expect(b.slug).toBe("client-dashboard-2");
    expect(a.status).toBe("ACTIVE");
    expect(a.workspaceId).toBe((await getCurrentWorkspace(alice.id)).id);
  });

  it("edits name, description, framework and port but keeps the slug stable", async () => {
    const p = await projects.createProject(alice.id, input({ name: "Portfolio" }));
    const updated = await projects.updateProject(alice.id, p.id, input({ name: "Portfolio Redesign", description: "New look", framework: "VUE", defaultPort: "5173" }));
    expect(updated).toMatchObject({ name: "Portfolio Redesign", description: "New look", framework: "VUE", defaultPort: 5173, slug: "portfolio" });
  });

  it("archives and restores without losing data", async () => {
    const p = await projects.createProject(alice.id, input({ name: "Archive Me" }));
    const archived = await projects.archiveProject(alice.id, p.id);
    expect(archived.status).toBe("ARCHIVED");
    expect(archived.archivedAt).toBeInstanceOf(Date);

    const restored = await projects.restoreProject(alice.id, p.id);
    expect(restored.status).toBe("ACTIVE");
    expect(restored.archivedAt).toBeNull();
    expect(restored.name).toBe("Archive Me");
  });

  it("permanently deletes a project", async () => {
    const p = await projects.createProject(alice.id, input({ name: "Delete Me" }));
    await projects.deleteProject(alice.id, p.id);
    expect(await prisma.project.findUnique({ where: { id: p.id } })).toBeNull();
  });

  it("searches by name and filters by status", async () => {
    const user = (await createVerifiedUser("Search User")).user;
    await projects.createProject(user.id, input({ name: "Alpha Store" }));
    const beta = await projects.createProject(user.id, input({ name: "Beta Store" }));
    await projects.createProject(user.id, input({ name: "Gamma API" }));
    await projects.archiveProject(user.id, beta.id);

    expect((await projects.listProjects(user.id, { query: "store" })).items.map((p) => p.name).sort()).toEqual(["Alpha Store", "Beta Store"]);
    expect((await projects.listProjects(user.id, { status: "archived" })).items.map((p) => p.name)).toEqual(["Beta Store"]);
    expect((await projects.listProjects(user.id, { status: "active" })).total).toBe(2);
  });

  it("reports correct dashboard counts", async () => {
    const user = (await createVerifiedUser("Count User")).user;
    expect(await projects.getProjectCounts(user.id)).toEqual({ total: 0, active: 0, archived: 0 });
    const [, b] = await Promise.all([
      projects.createProject(user.id, input({ name: "One" })),
      projects.createProject(user.id, input({ name: "Two" })),
      projects.createProject(user.id, input({ name: "Three" })),
    ]);
    await projects.archiveProject(user.id, b.id);
    expect(await projects.getProjectCounts(user.id)).toEqual({ total: 3, active: 2, archived: 1 });
  });
});

describe("project input validation", () => {
  it.each([
    [{ name: "" }, "name"],
    [{ name: "x".repeat(81) }, "name"],
    [{ defaultPort: "0" }, "defaultPort"],
    [{ defaultPort: "65536" }, "defaultPort"],
    [{ defaultPort: "30.5" }, "defaultPort"],
    [{ defaultPort: "abc" }, "defaultPort"],
    [{ framework: "RAILS" }, "framework"],
    [{ description: "d".repeat(501) }, "description"],
  ])("rejects %o", (overrides, field) => {
    const result = projectInputSchema.safeParse({ name: "Valid", description: "", framework: "", defaultPort: "", ...overrides });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].path[0]).toBe(field);
  });

  it("accepts boundary ports and empty optional fields", () => {
    expect(projectInputSchema.parse({ name: "P", description: "", framework: "", defaultPort: "1" }).defaultPort).toBe(1);
    expect(projectInputSchema.parse({ name: "P", description: "", framework: "", defaultPort: "65535" }).defaultPort).toBe(65535);
    expect(projectInputSchema.parse({ name: "P", description: "", framework: "", defaultPort: "" })).toEqual({
      name: "P",
      description: null,
      framework: null,
      defaultPort: null,
    });
  });
});

describe("authorization", () => {
  it("never lets one user read or change another user's project (no IDOR)", async () => {
    const secret = await projects.createProject(alice.id, input({ name: "Alice Secret" }));

    await expect(projects.getProjectForUser(bob.id, secret.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(projects.updateProject(bob.id, secret.id, input({ name: "Pwned" }))).rejects.toBeInstanceOf(NotFoundError);
    await expect(projects.archiveProject(bob.id, secret.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(projects.restoreProject(bob.id, secret.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(projects.deleteProject(bob.id, secret.id)).rejects.toBeInstanceOf(NotFoundError);

    const untouched = await prisma.project.findUniqueOrThrow({ where: { id: secret.id } });
    expect(untouched.name).toBe("Alice Secret");
    expect(untouched.status).toBe("ACTIVE");

    expect((await projects.listProjects(bob.id, {})).items.find((p) => p.id === secret.id)).toBeUndefined();
  });

  it("returns the same not-found error for missing and foreign projects", async () => {
    const secret = await projects.createProject(alice.id, input({ name: "Probe Target" }));
    const foreign = await projects.getProjectForUser(bob.id, secret.id).catch((e: Error) => e);
    const missing = await projects.getProjectForUser(bob.id, "cl_missing_id").catch((e: Error) => e);
    expect(foreign).toBeInstanceOf(NotFoundError);
    expect(missing).toBeInstanceOf(NotFoundError);
    expect((foreign as Error).message).toBe((missing as Error).message);
  });

  it("enforces workspace roles: members manage projects, only owners delete or change workspace settings", async () => {
    const owner = (await createVerifiedUser("Owner Person")).user;
    const member = (await createVerifiedUser("Member Person")).user;
    const workspace = await getCurrentWorkspace(owner.id);
    await prisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: member.id, role: "MEMBER" } });

    const p = await projects.createProject(owner.id, input({ name: "Shared App" }));
    expect((await projects.getProjectForUser(member.id, p.id)).id).toBe(p.id);
    expect((await projects.updateProject(member.id, p.id, input({ name: "Shared App v2" }))).name).toBe("Shared App v2");
    await expect(projects.deleteProject(member.id, p.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateWorkspace(member.id, workspace.id, { name: "Taken over", slug: "taken-over" })).rejects.toBeInstanceOf(ForbiddenError);

    // Outsiders can't touch workspace settings either (and learn nothing about it).
    await expect(updateWorkspace(bob.id, workspace.id, { name: "x", slug: "xyz" })).rejects.toBeInstanceOf(NotFoundError);
    expect((await prisma.workspace.findUniqueOrThrow({ where: { id: workspace.id } })).name).toBe(workspace.name);
  });

  it("rejects a workspace slug that is already taken", async () => {
    const aliceWs = await getCurrentWorkspace(alice.id);
    const bobWs = await getCurrentWorkspace(bob.id);
    const result = await updateWorkspace(bob.id, bobWs.id, { name: "Bob", slug: aliceWs.slug });
    expect(result.ok).toBe(false);
  });
});

describe("persistence", () => {
  it("keeps data across a brand-new database connection", async () => {
    const p = await projects.createProject(alice.id, input({ name: "Durable Project" }));

    const fresh = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    try {
      const reloaded = await fresh.project.findUniqueOrThrow({ where: { id: p.id } });
      expect(reloaded.name).toBe("Durable Project");
    } finally {
      await fresh.$disconnect();
    }
  });
});
