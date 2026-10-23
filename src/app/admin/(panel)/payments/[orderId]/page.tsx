import type { Metadata } from "next";
import { Check, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PaymentAdminActions } from "@/components/admin/PaymentAdminActions";
import { AdminHeader, fmtDate, Panel, Pill, statusLabel, statusTone } from "@/components/admin/Ui";
import { NotFoundError } from "@/server/errors";
import { getUpgradeRequest } from "@/server/upgrades";

export const metadata: Metadata = { title: "Payment" };

export default async function AdminPaymentPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  let r;
  try {
    r = await getUpgradeRequest(decodeURIComponent(orderId).toUpperCase());
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const v = r.verification;
  const facts: [string, ReactNode][] = [
    ["Order ID", <span key="Order ID" className="font-mono">{r.orderId}</span>],
    ["Customer", <Link key="Customer" href={`/admin/users/${r.user.publicId}`} className="underline underline-offset-2">{r.user.username ? `@${r.user.username}` : r.user.publicId}</Link>],
    ["Email", r.user.email],
    ["Project", r.project ? r.project.name : `${r.projectName} (deleted)`],
    ["Product", `${r.passDays}-Day Preview Pass (price and length fixed when ordered)`],
    ["Amount", `${Number(r.amountMicros) / 1_000_000} ${r.currency} on ${r.network}`],
    ["Pay to", <span key="Pay to" className="font-mono text-[12px]">{r.recipient}</span>],
    ["Custom URL requested", r.requestedName ?? "—"],
    ["Transaction", r.txHash ? <a href={`https://bscscan.com/tx/${r.txHash}`} target="_blank" rel="noopener noreferrer" className="break-all font-mono text-[12px] underline underline-offset-2">{r.txHash}</a> : "Not submitted yet"],
    ["Requested", fmtDate(r.createdAt)],
    ["Reviewed", r.reviewedAt ? `${fmtDate(r.reviewedAt)}${r.reviewerEmail ? ` by ${r.reviewerEmail}` : ""}` : "—"],
    ...(r.reviewNote ? ([["Note", r.reviewNote]] as [string, ReactNode][]) : []),
    ...(r.pass ? ([["Pass", `${fmtDate(r.pass.startsAt)} → ${fmtDate(r.pass.endsAt)}${r.pass.status === "REVOKED" ? " (revoked)" : ""}`]] as [string, ReactNode][]) : []),
  ];
  return (
    <>
      <Link href="/admin/payments" className="text-[13px] text-fg-3 hover:text-fg">
        ← Payments
      </Link>
      <AdminHeader title={r.orderId} description={<Pill tone={statusTone(r.status)}>{statusLabel(r.status)}</Pill>} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Request">
            <dl className="divide-y divide-line">
              {facts.map(([k, val]) => (
                <div key={k} className="flex items-start justify-between gap-4 px-5 py-3 text-[13.5px]">
                  <dt className="shrink-0 text-fg-3">{k}</dt>
                  <dd className="min-w-0 text-right text-fg">{val}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <Panel title="On-chain verification" action={v ? <Pill tone={r.verifiedOk ? "live" : "bad"}>{r.verifiedOk ? "All checks passed" : "Failed"}</Pill> : null}>
            {v ? (
              <div className="px-5 py-4">
                <ul className="flex flex-col gap-2" data-testid="verification-checks">
                  {v.checks.map((c) => (
                    <li key={c.id} className="flex items-start gap-2.5 text-[13.5px]">
                      {c.ok ? <Check className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-label="passed" /> : <X className="mt-0.5 size-4 shrink-0 text-danger" aria-label="failed" />}
                      <span>
                        <span className="text-fg">{c.label}</span>
                        <span className="block text-[12.5px] text-fg-3">{c.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-[12px] text-fg-3">
                  Checked {r.verifiedAt ? fmtDate(r.verifiedAt) : ""} via {v.rpc}
                  {v.from ? (
                    <>
                      {" "}
                      · from <span className="font-mono">{v.from}</span>
                    </>
                  ) : null}
                </p>
              </div>
            ) : (
              <p className="px-5 py-6 text-[13.5px] text-fg-3">Not verified yet. Approval needs a passing check.</p>
            )}
          </Panel>
        </div>
        <PaymentAdminActions request={{ orderId: r.orderId, status: r.status, txHash: r.txHash, verifiedOk: r.verifiedOk }} />
      </div>
    </>
  );
}
