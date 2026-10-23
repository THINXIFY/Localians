"use client";

import {
  AlertTriangle,
  Check,
  Clock,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog } from "@/components/app/Dialog";
import { FormError, inputClasses } from "@/components/app/Field";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { cn } from "@/lib/cn";
import {
  isOpenRequest,
  ORDER_STATUS_LABEL,
  type PayTo,
  type PaymentInfo,
  type PlanSummary,
} from "@/lib/plans";
import { suggestName } from "@/lib/preview-names";
import {
  cancelUpgradeAction,
  requestUpgradeAction,
  submitTxHashAction,
} from "@/server/actions/upgrades";
import { type NameCheck, NameField } from "../names/NameField";

export const PASS_BENEFITS = [
  "7 more days of sharing for this project",
  "One reserved custom URL",
  "Password protection",
  "Reconnect on the same link while it's active",
];

type OpenOrder = {
  orderId: string;
  status: "PENDING" | "UNDER_REVIEW";
  txHash: string | null;
  /** The order's own payment destination (snapshot); null while payments are off. */
  payTo?: PayTo | null;
};
const FAILED = {
  ok: false as const,
  error: "Couldn't reach Localians. Check your connection and try again.",
};

/**
 * 7-Day Preview Pass checkout: plan → (custom URL) → Order ID + USDT (BEP20) payment details → transaction hash →
 * status. Nothing activates until the transfer is verified on chain and an administrator approves it. While payments
 * are off, it shows the plan and "Payments coming soon" — no deposit address, no order.
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
  // The order this dialog just created is shown right away (no waiting for the page to refresh, no second order).
  const [created, setCreated] = useState<OpenOrder | null>(null);
  const fromPlan = isOpenRequest(plan.request)
    ? (plan.request as OpenOrder)
    : null;
  const order =
    created && (!fromPlan || fromPlan.orderId === created.orderId)
      ? { ...created, ...(fromPlan ?? {}) }
      : fromPlan;
  const renewing = Boolean(plan.pass);
  const askName = !hasCustomName && !renewing;
  const [name, setName] = useState(() => suggestName(project.name));
  const [check, setCheck] = useState<NameCheck>({ state: "idle" });
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState<
    "start" | "hash" | "cancel" | "refresh" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function start() {
    if (busy) return; // repeated clicks: one request at a time (the server also returns the open order)
    setBusy("start");
    setError(null);
    const result = await requestUpgradeAction(
      project.id,
      askName && name ? name : null,
    ).catch(() => FAILED);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setCreated({
      orderId: result.data.orderId,
      status: result.data.status,
      txHash: result.data.txHash,
      payTo: payment.recipient
        ? { recipient: payment.recipient, qr: payment.qr, qrImageUrl: payment.qrImageUrl }
        : null,
    });
    router.refresh();
  }
  async function submitHash(orderId: string) {
    if (busy) return;
    setBusy("hash");
    setError(null);
    const result = await submitTxHashAction(orderId, hash).catch(() => FAILED);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setSent(true);
    setCreated((c) =>
      c && c.orderId === orderId ? { ...c, txHash: hash.toLowerCase() } : c,
    );
    router.refresh();
  }
  async function cancel(orderId: string) {
    setBusy("cancel");
    const result = await cancelUpgradeAction(orderId).catch(() => FAILED);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setCreated(null);
    router.refresh();
    onClose();
  }
  function refresh() {
    setBusy("refresh");
    router.refresh();
    window.setTimeout(() => setBusy(null), 800);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={renewing ? "Renew your 7-Day Pass" : "7-Day Preview Pass"}
      busy={busy === "start" || busy === "hash"}
      className="max-w-[540px]"
    >
      <div
        className="flex flex-col gap-5 text-[13.5px] leading-relaxed text-fg-2"
        data-testid="upgrade-dialog"
      >
        <div className="flex flex-col gap-3 rounded-xl border border-accent/25 bg-accent/[0.05] p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-fg">
              {project.name}
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {PASS_BENEFITS.map((b) => (
                <li key={b} className="flex items-center gap-2 text-[13px]">
                  <Check
                    className="size-3.5 shrink-0 text-accent-ink"
                    aria-hidden="true"
                  />
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex shrink-0 items-baseline gap-2 sm:block sm:text-right">
            <p className="text-[26px] font-semibold leading-none tracking-[-0.03em] text-fg">
              $5
            </p>
            <p className="text-[11.5px] text-fg-3 sm:mt-1">one-time · 7 days</p>
          </div>
        </div>
        <p className="text-[12.5px] text-fg-3">
          {renewing
            ? "The new 7 days start when your current pass ends. "
            : "The 7 days start when your payment is verified. "}
          It doesn&apos;t renew by itself. Your computer and app must stay
          running for the preview to work.
        </p>

        {order ? (
          <PaymentStep
            order={order}
            payment={payment}
            hash={hash}
            setHash={setHash}
            busy={busy}
            error={error}
            sent={sent}
            onSubmit={() => submitHash(order.orderId)}
            onCancel={
              order.status === "PENDING" && !order.txHash
                ? () => cancel(order.orderId)
                : null
            }
            onRefresh={refresh}
          />
        ) : !payment.enabled ? (
          <div
            className="flex flex-col gap-3"
            data-testid="payments-coming-soon"
          >
            <div
              className="flex items-start gap-3 rounded-xl border border-line-strong bg-tint/[0.02] p-4"
              role="status"
            >
              <Sparkles
                className="mt-0.5 size-4 shrink-0 text-accent-ink"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium text-fg">Payments coming soon</p>
                <p className="mt-0.5 text-[13px]">
                  You&apos;ll be able to pay {payment.amountLabel} on{" "}
                  {payment.networkLabel} here. Questions? Email{" "}
                  <a
                    href={`mailto:${payment.supportEmail}`}
                    className="text-fg underline underline-offset-2"
                  >
                    {payment.supportEmail}
                  </a>
                  .
                </p>
              </div>
            </div>
            <Button size="lg" className="w-full" disabled>
              Pay {payment.amountLabel} — coming soon
            </Button>
          </div>
        ) : (
          <>
            <PaymentDetails
              payment={payment}
              payTo={
                payment.recipient
                  ? {
                      recipient: payment.recipient,
                      qr: payment.qr,
                      qrImageUrl: payment.qrImageUrl,
                    }
                  : null
              }
            />
            {askName ? (
              <NameField
                value={name}
                onChange={setName}
                onCheck={setCheck}
                previewDomain={previewDomain}
                label="Your custom URL (optional)"
              />
            ) : null}
            <FormError message={error} />
            <Button
              size="lg"
              className="w-full"
              loading={busy === "start"}
              disabled={
                busy !== null ||
                (askName && name !== "" && check.state === "unavailable")
              }
              onClick={start}
            >
              Get my Order ID
            </Button>
            <p className="text-center text-[12px] text-fg-3">
              Get your Order ID before you pay: include it in your email so we
              can match your payment. Nothing is charged automatically.
            </p>
          </>
        )}
      </div>
    </Dialog>
  );
}

function PaymentStep({
  order,
  payment,
  hash,
  setHash,
  busy,
  error,
  sent,
  onSubmit,
  onCancel,
  onRefresh,
}: {
  order: OpenOrder;
  payment: PaymentInfo;
  hash: string;
  setHash: (v: string) => void;
  busy: string | null;
  error: string | null;
  sent: boolean;
  onSubmit: () => void;
  onCancel: (() => void) | null;
  onRefresh: () => void;
}) {
  const submitted = sent || Boolean(order.txHash);
  return (
    <div className="flex flex-col gap-4" data-testid="payment-step">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px]">
          Order{" "}
          <span className="font-mono text-fg" data-testid="order-id">
            {order.orderId}
          </span>
        </p>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-medium",
              order.status === "UNDER_REVIEW"
                ? "border-warn/30 bg-warn/10 text-warn"
                : "border-line-strong text-fg-2",
            )}
            data-testid="order-status"
          >
            <Clock className="size-3" aria-hidden="true" />
            {submitted && order.status === "PENDING"
              ? "Awaiting verification"
              : ORDER_STATUS_LABEL[order.status]}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh status"
            className="rounded-md p-1 text-fg-3 hover:bg-tint/[0.05] hover:text-fg"
          >
            <RefreshCw
              className={cn(
                "size-3.5",
                busy === "refresh" && "motion-safe:animate-spin",
              )}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {order.payTo ? (
        <PaymentDetails payment={payment} payTo={order.payTo} />
      ) : (
        <p
          className="rounded-xl border border-line-strong bg-tint/[0.02] p-3 text-[12.5px]"
          role="status"
          data-testid="payments-paused"
        >
          New payments are paused. If you already paid for this order, add the
          transaction hash below and email us; your order is still reviewed.
        </p>
      )}

      <p className="flex items-start gap-2 rounded-xl border border-line p-3 text-[12.5px]">
        <Mail className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden="true" />
        <span>
          {payment.afterPaymentMessage}{" "}
          <a
            href={`mailto:${payment.supportEmail}?subject=${encodeURIComponent(`Payment for ${order.orderId}`)}`}
            className="text-fg underline underline-offset-2"
          >
            Email us
          </a>
        </span>
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
          <input
            id="tx-hash"
            value={hash}
            onChange={(e) => setHash(e.target.value.trim())}
            placeholder={order.txHash ?? "0x…"}
            className={`${inputClasses} h-10 min-w-0 flex-1 font-mono text-[12.5px]`}
            autoComplete="off"
            spellCheck={false}
          />
          <Button
            type="submit"
            size="sm"
            className="h-10"
            loading={busy === "hash"}
            disabled={!hash || busy !== null}
          >
            {order.txHash ? "Update" : "Submit"}
          </Button>
        </div>
        <FormError message={error} />
        {submitted ? (
          <p
            className="flex items-center gap-1.5 text-[12.5px] text-accent-ink"
            role="status"
            data-testid="hash-received"
          >
            <ShieldCheck className="size-3.5" aria-hidden="true" /> Received.
            We&apos;ll verify the transfer on BSC and email you when your pass
            is active.
          </p>
        ) : null}
      </form>
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          disabled={busy !== null}
          className="w-fit text-[12.5px] text-fg-3 underline underline-offset-2 hover:text-fg disabled:opacity-50"
        >
          Cancel this order
        </button>
      ) : null}
    </div>
  );
}

/**
 * Where and how to pay: QR, amount, network, wallet address with copy, and the network warning. `payTo` is the order's
 * own destination (or, before an order exists, the current one); the QR always encodes exactly `payTo.recipient`:
 * an uploaded image only if the server verified it, otherwise one generated from the address.
 */
function PaymentDetails({
  payment,
  payTo,
}: {
  payment: PaymentInfo;
  payTo: PayTo | null;
}) {
  if (!payTo) return null;
  const qrLabel = `QR code for the wallet address ${payTo.recipient}`;
  return (
    <div className="flex flex-col gap-4" data-testid="payment-details">
      <div className="grid gap-4 sm:grid-cols-[148px_minmax(0,1fr)]">
        {payTo.qrImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- verified upload streamed by an access-checked route
          <img
            src={payTo.qrImageUrl}
            alt={qrLabel}
            width={148}
            height={148}
            className="mx-auto size-[148px] rounded-xl bg-white object-contain p-1.5 sm:mx-0"
          />
        ) : payTo.qr ? (
          <svg
            role="img"
            aria-label={qrLabel}
            viewBox={`0 0 ${payTo.qr.size} ${payTo.qr.size}`}
            shapeRendering="crispEdges"
            className="mx-auto size-[148px] rounded-xl bg-white p-1.5 sm:mx-0"
          >
            <path d={payTo.qr.d} fill="#000" />
          </svg>
        ) : null}
        <dl className="flex min-w-0 flex-col gap-3">
          <div>
            <dt className="text-[12px] text-fg-3">Amount</dt>
            <dd className="text-[18px] font-semibold text-fg">
              {payment.amountLabel}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-fg-3">Network</dt>
            <dd className="text-fg">{payment.networkLabel}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-fg-3">Wallet address</dt>
            <dd className="flex items-start gap-2">
              <code
                className="min-w-0 break-all font-mono text-[12.5px] text-fg"
                data-testid="wallet-address"
              >
                {payTo.recipient}
              </code>
              <CopyButton value={payTo.recipient} label="Copy wallet address" />
            </dd>
          </div>
        </dl>
      </div>

      <p
        className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/[0.06] p-3 text-[12.5px] text-fg-2"
        role="note"
      >
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-warn"
          aria-hidden="true"
        />
        Send USDT on BNB Smart Chain (BEP20) only. USDT on another network, or
        another token, can&apos;t be recovered.
      </p>
    </div>
  );
}
