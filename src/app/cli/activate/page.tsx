import type { Metadata } from "next";
import { DeviceApproval } from "@/components/app/DeviceApproval";
import { ToastProvider } from "@/components/app/Toast";
import { Logo } from "@/components/ui/Logo";
import { findPendingDeviceAuthorization } from "@/server/cli/device";
import { rateLimit } from "@/server/rate-limit";
import { requireUser } from "@/server/session";
import { listWorkspaces } from "@/server/workspaces";

export const metadata: Metadata = { title: "Authorize the Localians CLI", robots: { index: false } };

export default async function CliActivatePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireUser("/cli/activate");
  const workspaces = await listWorkspaces(session.user.id);
  const code = ((await searchParams).code ?? "").slice(0, 16);

  let initialRequest: { userCode: string; clientName: string } | null = null;
  let initialError: string | null = null;
  if (code) {
    const allowed = (await rateLimit(`device-lookup:${session.user.id}`, 10, 60_000)).allowed;
    const pending = allowed ? await findPendingDeviceAuthorization(code) : null;
    if (pending) initialRequest = { userCode: pending.userCode, clientName: pending.clientName };
    else initialError = allowed ? "That code is invalid or has expired. Run `localians login` again for a new one." : "Too many attempts. Wait a minute and try again.";
  }

  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="bg-grid mask-fade-y absolute inset-0" />
      </div>
      <header className="container-x flex h-[var(--header-h)] items-center">
        <Logo href="/dashboard" />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-16 pt-8 sm:items-center sm:pt-0">
        <div className="w-full max-w-[460px]">
          <ToastProvider>
            <DeviceApproval
              initialCode={code}
              initialRequest={initialRequest}
              initialError={initialError}
              email={session.user.email}
              workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
            />
          </ToastProvider>
        </div>
      </main>
    </div>
  );
}
