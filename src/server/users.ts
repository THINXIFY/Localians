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
