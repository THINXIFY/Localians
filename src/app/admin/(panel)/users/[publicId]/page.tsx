import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ManagePlan } from "@/components/admin/ManagePlan";
import { UserAdminActions } from "@/components/admin/UserAdminActions";
import { AdminHeader, Empty, fmtDate, Panel, Pill, statusTone } from "@/components/admin/Ui";
import { getUserDetail } from "@/server/admin";
import { NotFoundError } from "@/server/errors";
import { getPlanManagement } from "@/server/plan-management";

export const metadata: Metadata = { title: "User" };

export default async function AdminUserPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  let detail;
  try {
    detail = await getUserDetail(decodeURIComponent(publicId).toUpperCase());
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { user, projects, sessions, cliLogins } = detail;
  const plan = await getPlanManagement(user.id);
  const now = new Date();
  const facts: [string, ReactNode][] = [
    ["User ID", <span key="User ID" className="font-mono">{user.publicId}</span>],
    ["Username", user.username ? `@${user.username}` : "Not chosen yet"],
    ["Email", `${user.email}${user.emailVerified ? "" : " (unverified)"}`],
    ["Plan", user.plan],
    ["Status", <Pill key="Status" tone={statusTone(user.status)}>{user.status.toLowerCase()}</Pill>],
    ["Registered", fmtDate(user.createdAt)],
    ["CLI logins", String(cliLogins)],
  ];
  return (
    <>
      <Link href="/admin/users" className="text-[13px] text-fg-3 hover:text-fg">
        ← Users
      </Link>
      <AdminHeader title={user.name} description={`${user.publicId}${user.username ? ` · @${user.username}` : ""}`} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Profile">
            <dl className="divide-y divide-line">
              {facts.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4 px-5 py-3 text-[13.5px]">
                  <dt className="text-fg-3">{k}</dt>
                  <dd className="min-w-0 truncate text-right text-fg">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <ManagePlan customer={{ id: user.id, publicId: user.publicId, username: user.username, status: user.status }} data={plan} />
          <Panel title={`Projects (${projects.length})`}>
            {projects.length ? (
              <ul className="divide-y divide-line">
                {projects.map((p) => {
                  const pass = p.passes[0];
                  const free = p.freeGrant ? (p.freeGrant.endsAt > now ? `free until ${fmtDate(p.freeGrant.endsAt)}` : "free preview used") : "free preview available";
                  return (
                    <li key={p.id} className="flex flex-col gap-1 px-5 py-3 text-[13.5px] sm:flex-row sm:items-center sm:justify-between">
                      <span className="min-w-0">
                        <span className="block truncate text-fg">{p.name}</span>
                        <span className="block text-[12.5px] text-fg-3">
                          {p.defaultPort ? `port ${p.defaultPort} · ` : ""}
                          {p.accessMode === "PASSWORD" ? "password protected" : "public"} · {p.status.toLowerCase()}
                          {p.previewName?.status === "ACTIVE" ? ` · ${p.previewName.name}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0">{pass ? <Pill tone="live">Pass until {fmtDate(pass.endsAt)}</Pill> : <Pill tone="off">{free}</Pill>}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>No projects.</Empty>
            )}
          </Panel>
          <Panel title="Recent previews">
            {sessions.length ? (
              <ul className="divide-y divide-line">
                {sessions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[13px]">
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-fg">{s.customName ?? s.hostname}</span>
                      <span className="block text-[12.5px] text-fg-3">
                        {s.project.name} · :{s.localPort} · {s.planTier?.toLowerCase() ?? "—"} · {fmtDate(s.createdAt)}
                      </span>
                    </span>
                    <Pill tone={s.status === "CONNECTED" ? "live" : "off"}>{s.status.toLowerCase()}</Pill>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No previews yet.</Empty>
            )}
          </Panel>
        </div>
        <UserAdminActions user={{ id: user.id, publicId: user.publicId, name: user.name, username: user.username ?? "", status: user.status }} />
      </div>
    </>
  );
}
