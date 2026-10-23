import "server-only";
import { ThemePreference } from "@/generated/prisma/enums";
import { prisma } from "./db";

export async function setThemePreference(userId: string, theme: ThemePreference) {
  await prisma.user.update({ where: { id: userId }, data: { themePreference: theme } });
}

export async function completeOnboarding(userId: string) {
  await prisma.user.updateMany({ where: { id: userId, onboardedAt: null }, data: { onboardedAt: new Date() } });
}

/** Which sign-in methods are connected, without exposing provider tokens. */
export async function getLinkedProviders(userId: string) {
  const accounts = await prisma.account.findMany({
    where: { userId },
    select: { id: true, providerId: true, accountId: true, createdAt: true, password: true },
    orderBy: { createdAt: "asc" },
  });
  return accounts.map(({ password, ...rest }) => ({ ...rest, hasPassword: rest.providerId === "credential" && !!password }));
}

export class UsernameError extends Error {}

/** Sets a user's username once (accounts from before usernames, or GitHub sign-ups). Unique; stored lowercase. */
export async function setUsername(userId: string, username: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true } });
  if (user.username) throw new UsernameError("You already have a username.");
  try {
    await prisma.user.update({ where: { id: userId }, data: { username } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new UsernameError("That username is taken. Try another.");
    throw error;
  }
}
