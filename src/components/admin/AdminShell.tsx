"use client";

import { CreditCard, LayoutDashboard, LogOut, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";
import { adminSignOutAction } from "@/server/actions/admin";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
] as const;

export function AdminShell({ admin, children }: { admin: { email: string }; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const active = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));
  const logout = async () => {
    setLeaving(true);
    await adminSignOutAction().catch(() => undefined);
    router.replace("/admin/login");
    router.refresh();
  };
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:h-dvh lg:flex-col lg:items-stretch lg:gap-1 lg:border-b-0 lg:border-r lg:px-3 lg:py-5">
        <div className="mr-auto flex min-w-0 items-center gap-2 lg:mb-6 lg:mr-0 lg:px-2">
          <Logo />
          <span className="hidden rounded-full border border-line px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.14em] text-fg-3 sm:inline lg:inline">Admin</span>
        </div>
        <nav aria-label="Admin" className="flex gap-1 lg:flex-col">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active(item.href) ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors",
                active(item.href) ? "bg-tint/[0.06] text-fg" : "text-fg-2 hover:bg-tint/[0.04] hover:text-fg",
              )}
            >
              <item.icon className={cn("size-4", active(item.href) ? "text-accent-ink" : "text-fg-3")} aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="shrink-0 lg:mt-auto lg:border-t lg:border-line lg:pt-4">
          <p className="hidden truncate px-2.5 pb-2 text-[12px] text-fg-3 lg:block">{admin.email}</p>
          <button
            type="button"
            onClick={logout}
            disabled={leaving}
            className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] text-fg-2 transition-colors hover:bg-tint/[0.04] hover:text-fg disabled:opacity-60 lg:w-full"
          >
            <LogOut className="size-4 text-fg-3" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Logout</span>
          </button>
        </div>
      </aside>
      <main id="main" className="min-w-0 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-[1120px]">{children}</div>
      </main>
    </div>
  );
}
