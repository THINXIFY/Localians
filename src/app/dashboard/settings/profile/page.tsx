import type { Metadata } from "next";
import { FormNotice } from "@/components/app/Field";
import { EmailForm, ProfileForm } from "@/components/app/settings/ProfileSettings";
import { getUserProfile, requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Profile settings" };

export default async function ProfileSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireUser();
  const profile = await getUserProfile(session.user.id);
  const { email } = await searchParams;

  return (
    <>
      {email === "updated" ? <FormNotice tone="success">Your email change was confirmed.</FormNotice> : null}
      <ProfileForm name={profile.name} image={profile.image} />
      <EmailForm email={profile.email} verified={profile.emailVerified} />
    </>
  );
}
