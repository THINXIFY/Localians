import type { Metadata } from "next";
import { CliCredentialsPanel } from "@/components/app/settings/CliSettings";
import { CliConnect } from "@/components/app/share/CliConnect";
import { formatDate, timeAgo } from "@/lib/format";
import { cliInfo } from "@/server/cli/config";
import { cliConnectStatus, listCliCredentials } from "@/server/cli/credentials";
import { getUserProfile, requireUser } from "@/server/session";

export const metadata: Metadata = { title: "CLI access" };

export default async function CliSettingsPage() {
  const session = await requireUser();
  const [credentials, profile] = await Promise.all([listCliCredentials(session.user.id), getUserProfile(session.user.id)]);
  return (
    <>
      <CliConnect run={cliInfo().run} account={{ username: profile.username, email: profile.email }} status={cliConnectStatus(credentials)} />
      <CliCredentialsPanel
        credentials={credentials.map((c) => ({
          id: c.id,
          name: c.name,
          tokenPrefix: c.tokenPrefix,
          created: formatDate(c.createdAt),
          lastUsed: c.lastUsedAt ? timeAgo(c.lastUsedAt) : "never",
          expires: formatDate(c.expiresAt),
        }))}
      />
    </>
  );
}
