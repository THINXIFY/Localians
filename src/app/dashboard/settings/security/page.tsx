import type { Metadata } from "next";
import { ChangePasswordForm, ProvidersPanel, SessionsPanel, SignOutPanel } from "@/components/app/settings/SecuritySettings";
import { timeAgo } from "@/lib/format";
import { githubConfigured } from "@/server/auth";
import { requireUser } from "@/server/session";
import { describeUserAgent, listUserSessions } from "@/server/sessions";
import { getLinkedProviders } from "@/server/users";

export const metadata: Metadata = { title: "Security settings" };

export default async function SecuritySettingsPage() {
  const session = await requireUser();
  const [providers, sessions] = await Promise.all([getLinkedProviders(session.user.id), listUserSessions(session.user.id)]);
  const hasPassword = providers.some((p) => p.hasPassword);
  const githubAccountId = providers.find((p) => p.providerId === "github")?.id ?? null;

  return (
    <>
      <ChangePasswordForm hasPassword={hasPassword} />
      <SessionsPanel
        sessions={sessions.map((s) => ({
          id: s.id,
          device: describeUserAgent(s.userAgent),
          ipAddress: s.ipAddress,
          lastActive: timeAgo(s.updatedAt),
          current: s.id === session.session.id,
        }))}
      />
      <ProvidersPanel githubConfigured={githubConfigured} githubAccountId={githubAccountId} canUnlink={providers.length > 1} />
      <SignOutPanel />
    </>
  );
}
