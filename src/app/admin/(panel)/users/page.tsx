import type { Metadata } from "next";
import { Search } from "lucide-react";
import Link from "next/link";
import { AdminHeader, Empty, fmtDate, Panel, Pill, statusTone } from "@/components/admin/Ui";
import { listUsers } from "@/server/admin";

export const metadata: Metadata = { title: "Users" };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const page = Number(params.page) || 1;
  const result = await listUsers({ q, page });
  const pageHref = (p: number) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;
  return (
    <>
      <AdminHeader title="Users" description={`${result.total} registered account${result.total === 1 ? "" : "s"}.`} />
      <form className="mb-4 flex max-w-md items-center gap-2 rounded-xl border border-line-strong bg-tint/[0.03] px-3 focus-within:border-accent/60" role="search">
        <Search className="size-4 text-fg-3" aria-hidden="true" />
        <label htmlFor="user-search" className="sr-only">
          Search users
        </label>
        <input id="user-search" name="q" defaultValue={q} placeholder="ID, username, email or name" className="h-10 min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-3" />
      </form>
      <Panel>
        {result.users.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13.5px]" data-testid="users-table">
              <thead className="border-b border-line text-[12px] uppercase tracking-[0.06em] text-fg-3">
                <tr>
                  {["User ID", "Username", "Full name", "Email", "Plan", "Status", "Registered"].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.users.map((u) => (
                  <tr key={u.id} className="hover:bg-tint/[0.03]">
                    <td className="px-4 py-3 font-mono text-[12.5px]">
                      <Link href={`/admin/users/${u.publicId}`} className="text-fg underline-offset-2 hover:underline">
                        {u.publicId}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-fg-2">{u.username ? `@${u.username}` : <span className="text-fg-3">—</span>}</td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-fg">{u.name}</td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-fg-2">{u.email}</td>
                    <td className="px-4 py-3">
                      <Pill tone={u.plan === "Free" ? "off" : "live"}>{u.plan}</Pill>
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={statusTone(u.status)}>{u.status.toLowerCase()}</Pill>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-fg-3">{fmtDate(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{q ? "No users match that search." : "No users yet."}</Empty>
        )}
      </Panel>
      {result.pages > 1 ? (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-3 text-[13px] text-fg-2">
          {result.page > 1 ? <Link href={pageHref(result.page - 1)}>Previous</Link> : null}
          <span className="text-fg-3">
            Page {result.page} of {result.pages}
          </span>
          {result.page < result.pages ? <Link href={pageHref(result.page + 1)}>Next</Link> : null}
        </nav>
      ) : null}
    </>
  );
}
