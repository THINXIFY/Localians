import type { Metadata } from "next";
import Link from "next/link";
import { AdminHeader, Empty, fmtDate, Panel, Pill, statusLabel, statusTone } from "@/components/admin/Ui";
import { cn } from "@/lib/cn";
import { listUpgradeRequests, paymentsEnabled } from "@/server/upgrades";

export const metadata: Metadata = { title: "Payments" };

const FILTERS = [
  { value: "open", label: "Open" },
  { value: "", label: "All" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
] as const;

const usdt = (micros: bigint) => `${Number(micros) / 1_000_000} USDT`;

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : "open";
  const q = typeof params.q === "string" ? params.q : "";
  const rows = await listUpgradeRequests({ status, q });
  return (
    <>
      <AdminHeader
        title="Payments"
        description={(await paymentsEnabled()) ? "Preview Pass requests. Verify each transfer on BSC before approving." : "Taking new requests is off (Settings → Payment system). Existing requests can still be reviewed."}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.label}
            href={`/admin/payments?status=${f.value}`}
            className={cn(
              "h-8 rounded-full border px-3 text-[12.5px] leading-8",
              status === f.value ? "border-accent/40 bg-accent/[0.08] text-fg" : "border-line text-fg-2 hover:border-line-strong hover:text-fg",
            )}
          >
            {f.label}
          </Link>
        ))}
        <form role="search" className="w-full sm:ml-auto sm:w-auto">
          <input type="hidden" name="status" value={status} />
          <label htmlFor="payment-search" className="sr-only">
            Search payments
          </label>
          <input id="payment-search" name="q" defaultValue={q} placeholder="Order ID, hash, username, email" className="h-9 w-full rounded-xl sm:w-64 border border-line-strong bg-tint/[0.03] px-3 text-[13px] text-fg outline-none placeholder:text-fg-3 focus:border-accent/60" />
        </form>
      </div>
      <Panel>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-[13px]" data-testid="payments-table">
              <thead className="border-b border-line text-[12px] uppercase tracking-[0.06em] text-fg-3">
                <tr>
                  {["Order ID", "Username", "Email", "Project", "Amount", "Transaction", "Status", "Requested"].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-tint/[0.03]">
                    <td className="px-4 py-3 font-mono">
                      <Link href={`/admin/payments/${r.orderId}`} className="text-fg underline-offset-2 hover:underline">
                        {r.orderId}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-fg-2">{r.user.username ? `@${r.user.username}` : r.user.publicId}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-fg-2">{r.user.email}</td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-fg">{r.projectName}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-fg">{usdt(r.amountMicros)}</td>
                    <td className="max-w-[150px] truncate px-4 py-3 font-mono text-[12px] text-fg-3">{r.txHash ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Pill tone={statusTone(r.status)}>{statusLabel(r.status)}</Pill>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-fg-3">{fmtDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No requests here.</Empty>
        )}
      </Panel>
    </>
  );
}
