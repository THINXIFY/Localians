import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/app/OnboardingFlow";
import { ToastProvider } from "@/components/app/Toast";
import { DevelopedBy } from "@/components/ui/Credit";
import { Logo } from "@/components/ui/Logo";
import { getUserProfile, requireUser } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspaces";

export const metadata: Metadata = { title: "Welcome", robots: { index: false } };

export default async function OnboardingPage() {
  const session = await requireUser("/onboarding");
  const [profile, workspace] = await Promise.all([getUserProfile(session.user.id), getCurrentWorkspace(session.user.id)]);
  if (profile.onboardedAt) redirect("/dashboard");

  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="bg-grid mask-fade-y absolute inset-0" />
        <div className="absolute left-1/2 top-[-300px] h-[560px] w-[min(900px,140vw)] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(184,255,59,0.1),transparent)]" />
      </div>
      <header className="container-x flex h-[var(--header-h)] items-center">
        <Logo href="/dashboard" />
      </header>
      <main id="main" className="flex flex-1 justify-center px-4 pb-16 pt-8 sm:pt-14">
        <div className="w-full max-w-[560px]">
          <ToastProvider>
            <OnboardingFlow firstName={profile.name.split(/\s+/)[0]} workspaceName={workspace.name} />
          </ToastProvider>
        </div>
      </main>
      <footer className="container-x flex h-14 items-center justify-center">
        <DevelopedBy />
      </footer>
    </div>
  );
}
