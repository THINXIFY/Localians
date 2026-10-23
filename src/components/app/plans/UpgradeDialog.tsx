"use client";

import { AlertTriangle, Check, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog } from "@/components/app/Dialog";
import { FormError, inputClasses } from "@/components/app/Field";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { cn } from "@/lib/cn";
import { isOpenRequest, ORDER_STATUS_LABEL, type PaymentInfo, type PlanSummary } from "@/lib/plans";
import { suggestName } from "@/lib/preview-names";
import { cancelUpgradeAction, requestUpgradeAction, submitTxHashAction } from "@/server/actions/upgrades";
import { type NameCheck, NameField } from "../names/NameField";

export const PASS_BENEFITS = ["7 more days of sharing for this project", "One reserved custom URL", "Password protection", "Reconnect on the same link while it's active"];

/**
 * 7-Day Preview Pass checkout: choose a custom URL → Order ID + USDT (BEP20) payment details → transaction hash →
 * status. Nothing activates until an administrator verifies the transfer on chain.
 */
export function UpgradeDialog({
  open,
  onClose,
  project,
  plan,
  payment,
  previewDomain,
  hasCustomName,
}: {
  open: boolean;
  onClose: () => void;
  project: { id: string; name: string };
  plan: PlanSummary;
  payment: PaymentInfo;
  previewDomain: string;
  hasCustomName: boolean;
}) {
  const router = useRouter();
  const request = isOpenRequest(plan.request) ? plan.request : null;
  const renewing = Boolean(plan.pass);
  const [name, setName] = useState(() => suggestName(project.name));
  const [check, setCheck] = useState<NameCheck>({ state: "idle" });
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function start() {
    setBusy("start");
    setError(null);
    const result = await requestUpgradeAction(project.id, hasCustomName || !name ? null : name).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
    setBusy(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }
  async function submitHash(orderId: string) {
    setBusy("hash");
    setError(null);
    const result = await submitTxHashAction(orderId, hash).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setSent(true);
    router.refresh();
  }
  async function cancel(orderId: string) {
    setBusy("cancel");
    await cancelUpgradeAction(orderId).catch(() => undefined);
    setBusy(null);
    router.refresh();
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title={renewing ? "Renew your 7-Day Pass" : "7-Day Preview Pass"} busy={busy !== null} className="max-w-[540px]">
      <div className="flex flex-col gap-5 text-[13.5px] leading-relaxed text-fg-2" data-testid="upgrade-dialog">
        <div className="flex items-start justify-between gap-4 rounded-xl border border-accent/25 bg-accent/[0.05] p-4">
          <div>
            <p className="text-[15px] font-semibold text-fg">{project.name}</p>
            <ul className="mt-2 flex flex-col gap-1">
              {PASS_BENEFITS.map((b) => (
                <li key={b} className="flex items-center gap-2 text-[13px]">
                  <Check className="size-3.5 shrink-0 text-accent-ink" aria-hidden="true" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[26px] font-semibold leading-none tracking-[-0.03em] text-fg">$5</p>
            <p className="mt-1 text-[11.5px] text-fg-3">one-time · 7 days</p>
          </div>
        </div>
        <p className="text-[12.5px] text-fg-3">
          {renewing ? "The new 7 days start when your current pass ends. " : "The 7 days start when your payment is verified. "}
          It doesn&apos;t renew by itself. Your computer and app must stay running for the preview to work.
        </p>

        {!payment.enabled ? (
          <p className="flex items-start gap-2 rounded-xl border border-line-strong p-4" role="status">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden="true" />
            <span>
              The 7-Day Pass is launching soon. Want it now? Email{" "}
              <a href={`mailto:${payment.supportEmail}`} className="text-fg underline underline-offset-2">
                {payment.supportEmail}
              </a>
              .
            </span>
          </p>
        ) : !request ? (
          <>
            {!hasCustomName && !renewing ? (
              <NameField value={name} onChange={setName} onCheck={setCheck} previewDomain={previewDomain} label="Your custom URL (optional)" />
            ) : null}
            <FormError message={error} />
            <Button size="lg" className="w-full" loading={busy === "start"} disabled={!hasCustomName && !renewing && name !== "" && check.state === "unavailable"} onClick={start}>
              Continue to payment
            </Button>
          </>
        ) : (
          <PaymentStep
            request={request}
            payment={payment}
            hash={hash}
            setHash={setHash}
            busy={busy}
            error={error}
            sent={sent || Boolean(request.txHash)}
            onSubmit={() => submitHash(request.orderId)}
            onCancel={request.status === "PENDING" && !request.txHash ? () => cancel(request.orderId) : null}
          />
        )}
      </div>
    </Dialog>
  );
}

function PaymentStep({
  request,
  payment,
  hash,
  setHash,
  busy,
  error,
  sent,
  onSubmit,
  onCancel,
}: {
  request: NonNullable<PlanSummary["request"]>;
  payment: PaymentInfo;
  hash: string;
  setHash: (v: string) => void;
  busy: string | null;
  error: string | null;
  sent: boolean;
  onSubmit: () => void;
  onCancel: (() => void) | null;
}) {
  return (
    <div className="flex flex-col gap-4" data-testid="payment-step">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px]">
          Order <span className="font-mono text-fg" data-testid="order-id">{request.orderId}</span>
        </p>
        <span className={cn("rounded-full border px-2 py-0.5 text-[11.5px] font-medium", request.status === "UNDER_REVIEW" ? "border-warn/30 bg-warn/10 text-warn" : "border-line-strong text-fg-2")}>
          {ORDER_STATUS_LABEL[request.status]}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-[148px_minmax(0,1fr)]">
        {payment.qrUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- small verified static QR
          <img src={payment.qrUrl} alt={`QR code for the wallet address ${payment.recipient}`} width={148} height={148} className="mx-auto size-[148px] rounded-xl bg-white p-1.5 sm:mx-0" />
        ) : null}
        <dl className="flex min-w-0 flex-col gap-3">
          <div>
            <dt className="text-[12px] text-fg-3">Amount</dt>
            <dd className="text-[18px] font-semibold text-fg">{payment.amountLabel}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-fg-3">Network</dt>
            <dd className="text-fg">{payment.networkLabel}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-fg-3">Wallet address</dt>
            <dd className="flex items-start gap-2">
              <code className="min-w-0 break-all font-mono text-[12.5px] text-fg" data-testid="wallet-address">
                {payment.recipient}
              </code>
              <CopyButton value={payment.recipient} label="Copy wallet address" />
            </dd>
          </div>
        </dl>
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/[0.06] p-3 text-[12.5px] text-fg-2" role="note">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
        Send USDT on BNB Smart Chain (BEP20) only. USDT on another network, or another token, can&apos;t be recovered.
      </p>

      <p className="flex items-start gap-2 text-[12.5px]">
        <Mail className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden="true" />
        <span>{payment.afterPaymentMessage}</span>
      </p>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor="tx-hash" className="text-[13px] font-medium text-fg">
          Transaction hash
        </label>
        <div className="flex gap-2">
          <input id="tx-hash" value={hash} onChange={(e) => setHash(e.target.value.trim())} placeholder={request.txHash ?? "0x…"} className={`${inputClasses} h-10 min-w-0 flex-1 font-mono text-[12.5px]`} autoComplete="off" spellCheck={false} />
          <Button type="submit" size="sm" className="h-10" loading={busy === "hash"} disabled={!hash}>
            {request.txHash ? "Update" : "Submit"}
          </Button>
        </div>
        <FormError message={error} />
        {sent ? (
          <p className="flex items-center gap-1.5 text-[12.5px] text-accent-ink" role="status">
            <ShieldCheck className="size-3.5" aria-hidden="true" /> Received. We&apos;ll verify the transfer on BSC and email you when your pass is active.
          </p>
        ) : null}
      </form>
      {onCancel ? (
        <button type="button" onClick={onCancel} className="w-fit text-[12.5px] text-fg-3 underline underline-offset-2 hover:text-fg">
          Cancel this order
        </button>
      ) : null}
    </div>
  );
}
