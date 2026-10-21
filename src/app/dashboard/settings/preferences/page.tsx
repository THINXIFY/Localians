import type { Metadata } from "next";
import { ThemePicker } from "@/components/app/settings/PreferencesSettings";
import { getUserProfile, requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Preferences" };

export default async function PreferencesPage() {
  const session = await requireUser();
  const profile = await getUserProfile(session.user.id);
  return <ThemePicker current={profile.themePreference} />;
}
