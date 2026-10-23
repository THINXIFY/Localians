import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { Logo } from "@/components/ui/Logo";
import { getAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "Admin sign-in · Localians", robots: { index: false, follow: false } };

export default async function AdminLoginPage() {
  if (await getAdmin()) redirect("/admin");
  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center px-4 py-16">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="bg-grid mask-fade-y absolute inset-0 opacity-60" />
        <div className="absolute left-1/2 top-[-320px] h-[560px] w-[min(900px,140vw)] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(184,255,59,0.08),transparent)]" />
      </div>
      <main id="main" className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <Logo priority />
          <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-3">Admin</span>
        </div>
        <div className="rounded-[20px] border border-line bg-card/90 p-6 shadow-[0_40px_100px_-50px_rgba(0,0,0,0.9)] backdrop-blur sm:p-8">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-fg">Administrator sign-in</h1>
          <p className="mt-1.5 text-[13.5px] text-fg-3">For Localians operators only.</p>
          <div className="mt-6">
            <AdminLoginForm />
          </div>
        </div>
      </main>
    </div>
  );
}
