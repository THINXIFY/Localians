"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog } from "@/components/app/Dialog";
import { FormError, inputClasses } from "@/components/app/Field";
import { Button } from "@/components/ui/Button";
import { adminSetTxHashAction, approveRequestAction, markUnderReviewAction, rejectRequestAction, verifyOnChainAction } from "@/server/actions/admin";
import { Panel } from "./Ui";

type R = { orderId: string; status: string; txHash: string | null; verifiedOk: boolean };

/**
 * Review steps for one request: under review → (attach hash from the customer's email) → Verify on BSC → Approve &
 * Activate, or Reject. Approve is only enabled after a passing verification (and the server checks again).
 */
export function PaymentAdminActions({ request }: { request: R }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [hash, setHash] = useState("");
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const open = request.status === "PENDING" || request.status === "UNDER_REVIEW";

  async function run(key: string, action: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, success: (data: unknown) => string) {
    setBusy(key);
    setMessage(null);
    const result = await action().catch(() => ({ ok: false, error: "Something went wrong." }));
    setBusy(null);
    setMessage(result.ok ? { ok: true, text: success((result as { data?: unknown }).data) } : { ok: false, text: result.error ?? "Failed." });
    if (result.ok) {
      setDialog(null);
      router.refresh();
    }
  }

  if (!open) {
    return (
      <Panel title="Actions">
        <p className="p-5 text-[13.5px] text-fg-3">This request is closed.</p>
      </Panel>
    );
  }
  return (
    <Panel title="Review">
      <div className="flex flex-col gap-4 p-5 text-[13px] text-fg-2">
        {message ? (
          <p role="status" className={message.ok ? "text-accent-ink" : "text-danger"} data-testid="payment-message">
            {message.text}
          </p>
        ) : null}
        <ol className="flex flex-col gap-4">
          <li className="flex flex-col gap-2">
            <span className="font-medium text-fg">1. Take it on</span>
            <Button variant="secondary" size="sm" className="h-9 w-fit" disabled={request.status !== "PENDING"} loading={busy === "review"} onClick={() => run("review", () => markUnderReviewAction(request.orderId), () => "Marked under review.")}>
              {request.status === "PENDING" ? "Mark Under Review" : "Under review"}
            </Button>
          </li>
          <li className="flex flex-col gap-2">
            <span className="font-medium text-fg">2. Transaction hash</span>
            {request.txHash ? <span className="break-all font-mono text-[12px] text-fg-3">{request.txHash}</span> : <span>Not submitted by the customer. Paste it from their email:</span>}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run("hash", () => adminSetTxHashAction(request.orderId, hash), () => "Transaction attached. Verify it next.");
              }}
            >
              <label htmlFor="admin-tx" className="sr-only">
                Transaction hash
              </label>
              <input id="admin-tx" value={hash} onChange={(e) => setHash(e.target.value.trim())} placeholder="0x…" className={`${inputClasses} h-9 min-w-0 flex-1 font-mono text-[12px]`} />
              <Button type="submit" variant="ghost" size="sm" className="h-9" loading={busy === "hash"} disabled={!hash}>
                {request.txHash ? "Replace" : "Attach"}
              </Button>
            </form>
          </li>
          <li className="flex flex-col gap-2">
            <span className="font-medium text-fg">3. Verify on BSC</span>
            <span>Checks the token (USDT BEP20), recipient, amount, success, confirmations and timing on chain.</span>
            <Button variant="secondary" size="sm" className="h-9 w-fit" disabled={!request.txHash} loading={busy === "verify"} onClick={() => run("verify", () => verifyOnChainAction(request.orderId), (d) => ((d as { ok?: boolean })?.ok ? "All checks passed." : "Verification failed — see the checks."))}>
              Verify on BSC
            </Button>
          </li>
          <li className="flex flex-col gap-2">
            <span className="font-medium text-fg">4. Decide</span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-9" disabled={!request.verifiedOk} onClick={() => setDialog("approve")}>
                Approve &amp; Activate
              </Button>
              <Button variant="ghost" size="sm" className="h-9 text-danger" onClick={() => setDialog("reject")}>
                Reject
              </Button>
            </div>
            {!request.verifiedOk ? <span className="text-[12px] text-fg-3">Approve unlocks after a passing verification.</span> : null}
          </li>
        </ol>
      </div>

      <Dialog open={dialog === "approve"} onClose={() => setDialog(null)} title="Approve and activate?" busy={busy !== null} className="max-w-[440px]">
        <div className="flex flex-col gap-4 text-[13.5px] text-fg-2">
          <p>The project gets a 7-Day Pass now (or right after its current pass), its custom URL is enabled, and the customer is emailed. This can&apos;t be undone here.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy === "approve"} onClick={() => run("approve", () => approveRequestAction(request.orderId), () => "Approved. The pass is active.")}>
              Approve &amp; Activate
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={dialog === "reject"} onClose={() => setDialog(null)} title="Reject this request?" busy={busy !== null} className="max-w-[440px]">
        <div className="flex flex-col gap-4 text-[13.5px] text-fg-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-fg">Reason (sent to the customer)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputClasses} h-10`} maxLength={300} data-autofocus />
          </label>
          <FormError message={message && !message.ok ? message.text : null} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={busy === "reject"} disabled={reason.trim().length < 3} onClick={() => run("reject", () => rejectRequestAction(request.orderId, reason), () => "Rejected. The customer was emailed.")}>
              Reject
            </Button>
          </div>
        </div>
      </Dialog>
    </Panel>
  );
}
