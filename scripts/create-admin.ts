/**
 * One-time creation of the first Localians administrator.
 *
 *   npm run admin:create                         # hello@thinxify.com, password asked for (hidden)
 *   npm run admin:create -- --email you@x.com
 *   LOCALIANS_ADMIN_PASSWORD=… npm run admin:create   # non-interactive (e.g. over SSH with a secret manager)
 *
 * Production: run on the server with the web environment, e.g.
 *   sudo -u localians bash -c 'cd /srv/localians/current && node --env-file=/etc/localians/web.env node_modules/.bin/tsx scripts/create-admin.ts'
 *
 * The password is never printed, logged, or stored anywhere but as a Better Auth (scrypt) hash. The script refuses
 * to run when an administrator already exists, or when the email already belongs to a regular account (it never
 * silently promotes anyone).
 */
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../src/generated/prisma/client";

const DEFAULT_EMAIL = "hello@thinxify.com";

function argValue(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Reads a line without echoing it. */
function askHidden(question: string) {
  return new Promise<string>((resolve) => {
    let muted = false;
    const output = new Writable({
      write(chunk, _enc, cb) {
        if (!muted) process.stdout.write(chunk);
        cb();
      },
    });
    const rl = createInterface({ input: process.stdin, output, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

function checkPassword(password: string) {
  if (password.length < 12) return "Use at least 12 characters.";
  if (password.length > 128) return "Use at most 128 characters.";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return "Include at least one letter and one number.";
  return null;
}

async function main() {
  const email = (argValue("--email") ?? DEFAULT_EMAIL).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Invalid --email.");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set (run with the web environment file).");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    if (await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } })) {
      throw new Error("An administrator already exists. This bootstrap runs only once.");
    }
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new Error(`${email} already has a regular account. Use a different email, or ask a developer to promote it deliberately.`);
    }

    let password = process.env.LOCALIANS_ADMIN_PASSWORD ?? "";
    if (!password) {
      if (!process.stdin.isTTY) throw new Error("No terminal to ask for the password: set LOCALIANS_ADMIN_PASSWORD for this command only.");
      password = await askHidden(`Password for ${email}: `);
      const again = await askHidden("Repeat the password: ");
      if (again !== password) throw new Error("The passwords don't match.");
    }
    const problem = checkPassword(password);
    if (problem) throw new Error(`Password not accepted: ${problem}`);

    const hash = await hashPassword(password);
    password = "";
    const id = randomBytes(16).toString("base64url");
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: { id, name: "Localians Admin", email, emailVerified: true, username: "admin", role: "ADMIN", onboardedAt: now, createdAt: now, updatedAt: now },
      });
      await tx.account.create({ data: { id: randomBytes(16).toString("base64url"), accountId: id, providerId: "credential", userId: id, password: hash, createdAt: now, updatedAt: now } });
      await tx.workspace.create({
        data: { name: "Localians Admin", slug: `admin-${randomBytes(3).toString("hex")}`, ownerId: id, members: { create: { userId: id, role: "OWNER" } } },
      });
      await tx.auditLog.create({ data: { actorType: "SYSTEM", action: "admin.created", subjectType: "user", subjectId: id, detail: { email } } });
    });
    console.log(`Administrator created: ${email}. Sign in at /admin/login.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Failed.");
  process.exit(1);
});
