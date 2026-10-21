"use client";

import { BarChart3, ChevronsUpDown, FolderKanban, LayoutGrid, LifeBuoy, LogOut, Menu as MenuIcon, Radio, Settings, Share2, User, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LogoMark } from "@/components/ui/Logo";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { Avatar } from "./Avatar";
import { Menu } from "./Menu";
import { useToast } from "./Toast";

const NAV = [
  { label: "Overview", href: "/dashboard", icon: LayoutGrid, exact: true },
  { label: "Share App", href: "/dashboard/share", icon: Share2 },
  { label: "Live Previews", href: "/dashboard/previews", icon: Radio },
  { label: "My Projects", href: "/dashboard/projects", icon: FolderKanban },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

type ShellUser = { name: string; email: string; image: string | null };
type ShellWorkspace = { name: string; role: "OWNER" | "MEMBER" };

function useSignOut() {
  const router = useRouter();
  const toast = useToast();
  return async () => {
    const { error } = await authClient.signOut();
    if (error) {
      toast.error("Couldn't sign out. Check your connection and try again.");
      return;
    }
    router.replace("/login?reason=signed-out");
    router.refresh();
  };
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition-colors",
                active ? "bg-tint/[0.07] font-medium text-fg" : "text-fg-2 hover:bg-tint/[0.04] hover:text-fg",
              )}
            >
              <item.icon className={cn("size-4 shrink-0", active ? "text-accent-ink" : "text-fg-3 group-hover:text-fg-2")} aria-hidden="true" />
              <span className="flex-1">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SidebarContent({ user, onNavigate }: { user: ShellUser; onNavigate?: () => void }) {
  const signOut = useSignOut();
  return (
    <div className="flex h-full flex-col">
      <Link href="/dashboard" onClick={onNavigate} className="flex h-16 shrink-0 items-center gap-2.5 px-5 text-fg" aria-label="Localians dashboard">
        <LogoMark />
        <span className="text-[14px] font-semibold tracking-[0.18em]">LOCALIANS</span>
      </Link>
      <nav aria-label="Dashboard" className="flex-1 overflow-y-auto px-3 py-2">
        <NavLinks onNavigate={onNavigate} />
        <Link
          href="/docs/troubleshooting"
          onClick={onNavigate}
          className="mt-4 flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] text-fg-3 transition-colors hover:bg-tint/[0.04] hover:text-fg"
        >
          <LifeBuoy className="size-4 shrink-0" aria-hidden="true" />
          Connection Help
        </Link>
      </nav>
      <div className="border-t border-line p-3">
        <Link
          href="/dashboard/settings/profile"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-tint/[0.04]"
        >
          <Avatar name={user.name} image={user.image} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-medium text-fg">{user.name}</span>
            <span className="block truncate text-[12px] text-fg-3">{user.email}</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={signOut}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] text-fg-2 transition-colors hover:bg-tint/[0.04] hover:text-fg"
        >
          <LogOut className="size-4 text-fg-3" aria-hidden="true" />
          Sign Out
        </button>
      </div>
    </div>
  );
}

export function DashboardShell({ user, workspace, children }: { user: ShellUser; workspace: ShellWorkspace; children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const signOut = useSignOut();

  // Drawer links close it via onNavigate; lock background scroll while it is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-dvh bg-bg text-fg">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-line bg-bg-2 lg:block">
        <SidebarContent user={user} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Dashboard navigation">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-overlay" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[min(300px,85vw)] animate-[menu-in_160ms_ease-out] border-r border-line bg-bg-2 shadow-2xl">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-3.5 flex size-9 items-center justify-center rounded-lg text-fg-2 hover:bg-tint/[0.06] hover:text-fg"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
            <SidebarContent user={user} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            className="-ml-1.5 flex size-9 items-center justify-center rounded-lg text-fg-2 hover:bg-tint/[0.06] hover:text-fg lg:hidden"
          >
            <MenuIcon className="size-5" aria-hidden="true" />
          </button>

          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-md border border-line-strong bg-elevated text-[11px] font-semibold text-fg-2"
            >
              {workspace.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="sr-only">Workspace: </span>
              <span className="block truncate text-[13.5px] font-medium text-fg">{workspace.name}</span>
            </span>
            <span className="hidden rounded-full border border-line px-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-fg-3 sm:inline">
              {workspace.role === "OWNER" ? "Owner" : "Member"}
            </span>
          </div>

          <div className="ml-auto">
            <Menu
              triggerLabel="Account menu"
              triggerClassName="flex items-center gap-2 rounded-full p-0.5 pr-2 transition-colors hover:bg-tint/[0.05] focus-visible:outline-offset-2"
              trigger={() => (
                <>
                  <Avatar name={user.name} image={user.image} size={30} />
                  <ChevronsUpDown className="hidden size-3.5 text-fg-3 sm:block" aria-hidden="true" />
                </>
              )}
              header={
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium text-fg">{user.name}</p>
                  <p className="truncate text-[12px] text-fg-3">{user.email}</p>
                </div>
              }
              items={[
                { type: "link", label: "Profile", href: "/dashboard/settings/profile", icon: <User className="size-4 text-fg-3" aria-hidden="true" /> },
                { type: "link", label: "Settings", href: "/dashboard/settings", icon: <Settings className="size-4 text-fg-3" aria-hidden="true" /> },
                { type: "separator" },
                { type: "action", label: "Sign out", onSelect: signOut, icon: <LogOut className="size-4" aria-hidden="true" /> },
              ]}
            />
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
