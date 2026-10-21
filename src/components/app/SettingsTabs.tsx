"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { label: "Profile", href: "/dashboard/settings/profile" },
  { label: "Security", href: "/dashboard/settings/security" },
  { label: "Preferences", href: "/dashboard/settings/preferences" },
  { label: "Workspace", href: "/dashboard/settings/workspace" },
  { label: "CLI", href: "/dashboard/settings/cli" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1 border-b border-line sm:w-full">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative block px-3.5 pb-3 pt-1 text-[14px] transition-colors",
                  active ? "font-medium text-fg" : "text-fg-2 hover:text-fg",
                )}
              >
                {tab.label}
                {active ? <span aria-hidden="true" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
