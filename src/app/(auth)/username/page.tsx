import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { UsernameForm } from "@/components/auth/UsernameForm";
import { getUserProfile, requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Choose a username", robots: { index: false, follow: false } };

/** Accounts from before usernames (and GitHub sign-ups) choose one before using the dashboard. */
export default async function UsernamePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await requireUser("/username");
  const profile = await getUserProfile(session.user.id);
  const next = (await searchParams).next;
  const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (profile.username) redirect(destination);
  return (
    <AuthCard title="Choose a username" description="It identifies your account to Localians support. You can't change it later yourself.">
      <UsernameForm next={destination} />
    </AuthCard>
  );
}
