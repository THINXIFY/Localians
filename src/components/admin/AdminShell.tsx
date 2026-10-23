"use client";

import { CreditCard, LayoutDashboard, LogOut, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";
import { adminSignOutAction } from "@/server/actions/admin";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/settings", label: "Settings", icon: Settings },
] as const;

function AdminBadge() {
  return <span className="shrink-0 rounded-full border border-accent/30 bg-accent/[0.08] px-2 py-0.5 font-mono text-[10px] font-medium uppercase leading-none tracking-[0.14em] text-accent-ink">Admin</span>;
}

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

  const navLink = (item: (typeof NAV)[number], compact: boolean) => {
    const on = active(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={on ? "page" : undefined}
        className={cn(
          "group relative flex shrink-0 items-center rounded-lg font-medium transition-colors duration-150 focus-visible:outline-offset-2",
          compact ? "h-9 gap-1.5 px-2 text-[13px]" : "h-10 gap-3 px-3 text-[13.5px]",
          on ? "bg-tint/[0.06] text-fg" : "text-fg-2 hover:bg-tint/[0.035] hover:text-fg",
        )}
      >
        {/* Active indicator: a slim accent bar on the rail, an underline in the compact bar. */}
        {on ? (
          <span
            aria-hidden="true"
            className={cn("absolute rounded-full bg-accent", compact ? "inset-x-2 -bottom-[7px] h-0.5" : "-left-3 top-2 bottom-2 w-[3px]")}
          />
        ) : null}
        <item.icon className={cn(compact ? "size-4" : "size-[18px]", "shrink-0 transition-colors", on ? "text-accent-ink" : "text-fg-3 group-hover:text-fg-2")} aria-hidden="true" />
        <span className="whitespace-nowrap">{item.label}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-bg lg:flex" aria-label="Admin sidebar">
        <div className="flex h-16 items-center gap-2.5 border-b border-line px-5">
          <Logo height={22} href="/admin" />
          <AdminBadge />
        </div>
        <nav aria-label="Admin" className="flex flex-col gap-1 px-3 py-4">
          {NAV.map((item) => navLink(item, false))}
        </nav>
        <div className="mt-auto border-t border-line p-3">
          <p className="truncate px-3 pb-2 text-[12px] text-fg-3" title={admin.email}>
            {admin.email}
          </p>
          <button
            type="button"
            onClick={logout}
            disabled={leaving}
            className="group flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium text-fg-2 transition-colors hover:bg-tint/[0.035] hover:text-fg disabled:opacity-60"
          >
            <LogOut className="size-[18px] text-fg-3 group-hover:text-fg-2" aria-hidden="true" />
            Logout
          </button>
        </div>
      </aside>

      {/* Mobile / tablet bar */}
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center gap-2.5 px-4">
          <Logo height={20} href="/admin" />
          <AdminBadge />
          <button
            type="button"
            onClick={logout}
            disabled={leaving}
            aria-label="Logout"
            className="ml-auto inline-flex size-9 items-center justify-center rounded-lg text-fg-2 hover:bg-tint/[0.05] hover:text-fg disabled:opacity-60"
          >
            <LogOut className="size-[18px]" aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Admin" className="-mb-px flex justify-between gap-0.5 overflow-x-auto px-2 pb-2 [scrollbar-width:none] sm:justify-start sm:gap-1 sm:px-3">
          {NAV.map((item) => navLink(item, true))}
        </nav>
      </header>

      <main id="main" className="min-w-0 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-[1120px]">{children}</div>
      </main>
    </div>
  );
}
