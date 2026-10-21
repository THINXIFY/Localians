import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { DashboardShell } from "@/components/app/DashboardShell";
import { ToastProvider } from "@/components/app/Toast";
import { getUserProfile, requireUser } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspaces";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s · Localians" },
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireUser();
  const [profile, workspace] = await Promise.all([getUserProfile(session.user.id), getCurrentWorkspace(session.user.id)]);
  if (!profile.onboardedAt) redirect("/onboarding");

  return (
    // Theme is rendered on the server from the saved preference, so there is no flash on load.
    <div className="theme-scope" data-theme={profile.themePreference.toLowerCase()}>
      <ToastProvider>
        <DashboardShell
          user={{ name: profile.name, email: profile.email, image: profile.image }}
          workspace={{ name: workspace.name, role: workspace.role }}
        >
          {children}
        </DashboardShell>
      </ToastProvider>
    </div>
  );
}
