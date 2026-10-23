import type { Metadata } from "next";
import { ArrowRight, BadgeCheck, Clock, Radio, Users } from "lucide-react";
import Link from "next/link";
import { AdminHeader, Empty, fmtDate, Panel, Pill, statusTone } from "@/components/admin/Ui";
import { getAdminOverview } from "@/server/admin";
import { listUpgradeRequests, upgradeCounts } from "@/server/upgrades";

export const metadata: Metadata = { title: "Overview" };

export default async function AdminDashboardPage() {
  const [overview, counts, requests] = await Promise.all([getAdminOverview(), upgradeCounts(), listUpgradeRequests()]);
  const cards = [
    { label: "Total users", value: overview.users, icon: Users, href: "/admin/users" },
    { label: "Active previews", value: overview.activePreviews, icon: Radio },
    { label: "Pending upgrade requests", value: counts.pending, icon: Clock, href: "/admin/payments?status=open", highlight: counts.pending > 0 },
    { label: "Verified payments", value: counts.approved, icon: BadgeCheck, href: "/admin/payments?status=APPROVED" },
  ];
  return (
    <>
      <AdminHeader title="Overview" description="Users, previews and Preview Pass requests at a glance." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="admin-cards">
        {cards.map((c) => {
          const body = (
            <>
              <c.icon className={c.highlight ? "size-4 text-accent-ink" : "size-4 text-fg-3"} aria-hidden="true" />
              <p className="mt-4 text-[28px] font-semibold tabular-nums tracking-[-0.03em] text-fg">{c.value}</p>
              <p className="mt-0.5 text-[13px] text-fg-3">{c.label}</p>
            </>
          );
          const cls = `rounded-[var(--radius-card)] border bg-card p-4 sm:p-5 ${c.highlight ? "border-accent/35" : "border-line"}`;
          return c.href ? (
            <Link key={c.label} href={c.href} className={`${cls} transition-colors hover:border-line-strong`}>
              {body}
            </Link>
          ) : (
            <div key={c.label} className={cls}>
              {body}
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Recently registered" action={<QuickLink href="/admin/users">All users</QuickLink>}>
          {overview.recentUsers.length ? (
            <ul className="divide-y divide-line">
              {overview.recentUsers.map((u) => (
                <li key={u.id}>
                  <Link href={`/admin/users/${u.publicId}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-tint/[0.03]">
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] text-fg">{u.username ? `@${u.username}` : u.name}</span>
                      <span className="block truncate text-[12.5px] text-fg-3">
                        {u.publicId} · {u.email}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12px] text-fg-3">{fmtDate(u.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No users yet.</Empty>
          )}
        </Panel>
        <Panel title="Recent upgrade requests" action={<QuickLink href="/admin/payments">All payments</QuickLink>}>
          {requests.length ? (
            <ul className="divide-y divide-line">
              {requests.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/payments/${r.orderId}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-tint/[0.03]">
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-[13px] text-fg">{r.orderId}</span>
                      <span className="block truncate text-[12.5px] text-fg-3">
                        {r.user.username ? `@${r.user.username}` : r.user.publicId} · {r.projectName}
                      </span>
                    </span>
                    <Pill tone={statusTone(r.status)}>{r.status.replace("_", " ").toLowerCase()}</Pill>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No upgrade requests yet.</Empty>
          )}
        </Panel>
      </div>
    </>
  );
}

function QuickLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-[12.5px] text-fg-2 hover:text-fg">
      {children}
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}
