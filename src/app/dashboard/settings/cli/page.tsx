import type { Metadata } from "next";
import { CliCredentialsPanel } from "@/components/app/settings/CliSettings";
import { formatDate, timeAgo } from "@/lib/format";
import { listCliCredentials } from "@/server/cli/credentials";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "CLI access" };

export default async function CliSettingsPage() {
  const session = await requireUser();
  const credentials = await listCliCredentials(session.user.id);
  return (
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
  );
}
