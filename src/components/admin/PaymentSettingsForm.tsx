"use client";

import { AlertTriangle, ImageUp, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Dialog } from "@/components/app/Dialog";
import { FormError, FormNotice, inputClasses, PasswordInput } from "@/components/app/Field";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { checkBscAddress } from "@/lib/wallet";
import { changeWalletAction, resetPaymentQrAction, setPaymentsEnabledAction, uploadPaymentQrAction } from "@/server/actions/admin";
import { Pill } from "./Ui";

type View = {
  enabled: boolean;
  effective: boolean;
  emergencyDisabled: boolean;
  recipient: string;
  qrImageUrl: string | null;
  generatedQr: { size: number; d: string };
  updatedAt: string;
  updatedBy: string | null;
};

const FAILED = { ok: false as const, error: "Couldn't reach the server. Check your connection and try again." };
const ACCEPT = "image/png,image/jpeg,image/webp";

function Section({ title, description, status, children }: { title: string; description: string; status?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
          <p className="mt-0.5 text-[13px] text-fg-3">{description}</p>
        </div>
        {status}
      </header>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

export function PaymentSettingsForm({ view }: { view: View }) {
  const updated = view.updatedBy ? `Last updated ${formatDateTime(new Date(view.updatedAt))} by ${view.updatedBy}` : `Last updated ${formatDateTime(new Date(view.updatedAt))}`;
  return (
    <div className="flex max-w-[820px] flex-col gap-5" data-testid="payment-settings">
      <PaymentSystem view={view} />
      <Wallet view={view} />
      <QrCode view={view} />
      <p className="text-[12.5px] text-fg-3" data-testid="settings-updated">
        {updated}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ 1. on / off

function PaymentSystem({ view }: { view: View }) {
  const router = useRouter();
  const [on, setOn] = useState(view.enabled);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // The saved value changed (after a refresh): start from it again.
  const [synced, setSynced] = useState(view.enabled);
  if (synced !== view.enabled) {
    setSynced(view.enabled);
    setOn(view.enabled);
  }
  const dirty = on !== view.enabled;

  async function save() {
    setBusy(true);
    setError(null);
    const result = await setPaymentsEnabledAction(on).catch(() => FAILED);
    setBusy(false);
    setConfirming(false);
    if (!result.ok) return setError(result.error);
    setSaved(true);
    router.refresh();
  }

  return (
    <Section
      title="Payment system"
      description="Whether customers can start new 7-Day Pass orders."
      status={<Pill tone={view.effective ? "live" : "off"}>{view.effective ? "Enabled" : "Disabled"}</Pill>}
    >
      <div className="flex flex-col gap-4">
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-line-strong px-4 py-3">
          <span>
            <span className="block text-[14px] font-medium text-fg">Accept payments</span>
            <span className="block text-[12.5px] text-fg-3">
              {on ? "Customers see the wallet, QR code and Get my Order ID." : "Customers see “Payments coming soon”. No wallet or QR code is shown."}
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Accept payments"
            onClick={() => {
              setOn((v) => !v);
              setSaved(false);
            }}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:shadow-[0_0_0_3px_var(--accent-glow)] focus-visible:outline-none",
              on ? "border-accent/60 bg-accent" : "border-line-strong bg-tint/[0.08]",
            )}
          >
            <span className={cn("inline-block size-[18px] rounded-full bg-white shadow transition-transform", on ? "translate-x-[22px]" : "translate-x-[3px]")} />
          </button>
        </label>
        {view.emergencyDisabled ? (
          <p className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/[0.06] p-3 text-[13px] text-fg-2" role="note">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
            Payments are forced off on this server (PAYMENTS_EMERGENCY_DISABLE=on). This setting takes effect once that is removed.
          </p>
        ) : null}
        <p className="text-[12.5px] text-fg-3">Turning payments off never affects existing orders, payment records or active passes.</p>
        <FormError message={error} />
        {saved && !dirty ? <FormNotice tone="success">Saved. The checkout and the public pages now show payments as {view.enabled ? "enabled" : "disabled"}.</FormNotice> : null}
        <div>
          <Button size="sm" className="h-10" disabled={!dirty || busy} loading={busy && !confirming} onClick={() => (on ? setConfirming(true) : save())}>
            Save changes
          </Button>
        </div>
      </div>
      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Turn payments on?" busy={busy}>
        <div className="flex flex-col gap-4 text-[13.5px] text-fg-2">
          <p>Customers will be able to create orders and see this wallet for 5 USDT on BNB Smart Chain (BEP20):</p>
          <code className="break-all rounded-lg border border-line bg-bg-2 px-3 py-2 font-mono text-[12.5px] text-fg">{view.recipient}</code>
          <p>Every pass still needs an on-chain check and your approval in Payments.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" className="h-10" onClick={() => setConfirming(false)} data-autofocus>
              Cancel
            </Button>
            <Button size="sm" className="h-10" loading={busy} onClick={save}>
              Turn payments on
            </Button>
          </div>
        </div>
      </Dialog>
    </Section>
  );
}

// ------------------------------------------------------------------ 2. wallet

function Wallet({ view }: { view: View }) {
  const router = useRouter();
  const id = useId();
  const [address, setAddress] = useState(view.recipient);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [synced, setSynced] = useState(view.recipient);
  if (synced !== view.recipient) {
    setSynced(view.recipient);
    setAddress(view.recipient);
  }
  const trimmed = address.trim();
  const check = trimmed ? checkBscAddress(trimmed) : null;
  const changed = check?.ok ? check.address !== view.recipient : trimmed.toLowerCase() !== view.recipient;

  async function save() {
    setBusy(true);
    setDialogError(null);
    const result = await changeWalletAction({ address: trimmed, password }).catch(() => FAILED);
    setBusy(false);
    if (!result.ok) return setDialogError(result.error);
    setConfirming(false);
    setPassword("");
    setSaved(true);
    router.refresh();
  }

  return (
    <Section title="USDT wallet" description="Where new orders pay to. Existing orders keep the wallet they were created with.">
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3 text-[13px]">
          <div className="rounded-xl border border-line px-3.5 py-2.5">
            <dt className="text-[12px] text-fg-3">Cryptocurrency</dt>
            <dd className="font-medium text-fg">USDT</dd>
          </div>
          <div className="rounded-xl border border-line px-3.5 py-2.5">
            <dt className="text-[12px] text-fg-3">Network</dt>
            <dd className="font-medium text-fg">BNB Smart Chain (BEP20)</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-address`} className="text-[13px] font-medium text-fg">
            Wallet address
          </label>
          <input
            id={`${id}-address`}
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setSaved(false);
              setError(null);
            }}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={check ? !check.ok : undefined}
            className={cn(inputClasses, "h-11 font-mono text-[11.5px] sm:text-[13px]")}
            data-testid="wallet-input"
          />
          <p className={cn("text-[12px]", check && !check.ok ? "text-danger" : "text-fg-3")}>
            {check && !check.ok ? check.error : "0x… address. Mixed-case addresses must match their checksum. Never enter a private key or recovery phrase."}
          </p>
        </div>
        <FormError message={error} />
        {saved ? <FormNotice tone="success">Wallet updated. hello@thinxify.com was notified. New orders pay to the new wallet.</FormNotice> : null}
        <div>
          <Button
            size="sm"
            className="h-10"
            disabled={!changed || !check?.ok || busy}
            onClick={() => {
              setDialogError(null);
              setConfirming(true);
            }}
          >
            Save changes
          </Button>
        </div>
      </div>
      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Change the payment wallet?" busy={busy}>
        <form
          className="flex flex-col gap-4 text-[13.5px] text-fg-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="flex flex-col gap-2">
            <p className="text-[12px] text-fg-3">From</p>
            <code className="break-all rounded-lg border border-line bg-bg-2 px-3 py-2 font-mono text-[12.5px] text-fg-2" data-testid="wallet-old">
              {view.recipient}
            </code>
            <p className="text-[12px] text-fg-3">To</p>
            <code className="break-all rounded-lg border border-accent/35 bg-accent/[0.05] px-3 py-2 font-mono text-[12.5px] text-fg" data-testid="wallet-new">
              {check?.ok ? check.checksum : trimmed}
            </code>
          </div>
          <p>Check every character. Payments sent to a wrong address can&apos;t be recovered. An uploaded QR code is cleared (it encodes the old wallet); the generated QR is used until you upload a new one.</p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-password`} className="text-[13px] font-medium text-fg">
              Your admin password
            </label>
            <PasswordInput id={`${id}-password`} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="h-10" />
          </div>
          <FormError message={dialogError} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" className="h-10" onClick={() => setConfirming(false)} data-autofocus>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="h-10" loading={busy} disabled={!password}>
              Change wallet
            </Button>
          </div>
        </form>
      </Dialog>
    </Section>
  );
}

// ------------------------------------------------------------------ 3. QR code

function QrCode({ view }: { view: View }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<"upload" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  function choose(f: File | null) {
    setError(null);
    setNotice(null);
    if (!f) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) return setError("Upload a PNG, JPEG or WebP image.");
    if (f.size > 2 * 1024 * 1024) return setError("Images can be up to 2 MB.");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }
  async function upload() {
    if (!file) return;
    setBusy("upload");
    setError(null);
    const form = new FormData();
    form.set("file", file);
    const result = await uploadPaymentQrAction(form).catch(() => FAILED);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setFile(null);
    setPreview(null);
    if (input.current) input.current.value = "";
    setNotice("QR code saved. It was checked to point to the configured wallet.");
    router.refresh();
  }
  async function reset() {
    setBusy("reset");
    setError(null);
    const result = await resetPaymentQrAction().catch(() => FAILED);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setNotice("Using the QR code generated from the wallet address.");
    router.refresh();
  }

  const label = `QR code for the wallet address ${view.recipient}`;
  return (
    <Section
      title="QR code"
      description="Customers scan this to pay. An upload is accepted only if it points to the wallet above."
      status={<Pill tone="off">{view.qrImageUrl ? "Uploaded" : "Generated"}</Pill>}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="mx-auto shrink-0 sm:mx-0">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file (blob URL)
            <img src={preview} alt="Chosen QR image (not saved yet)" className="size-40 rounded-xl border border-accent/40 bg-white object-contain p-2" />
          ) : view.qrImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- verified upload streamed by an access-checked route
            <img src={view.qrImageUrl} alt={label} className="size-40 rounded-xl bg-white object-contain p-2" />
          ) : (
            <svg role="img" aria-label={label} viewBox={`0 0 ${view.generatedQr.size} ${view.generatedQr.size}`} shapeRendering="crispEdges" className="size-40 rounded-xl bg-white p-2">
              <path d={view.generatedQr.d} fill="#000" />
            </svg>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <p className="text-[13px] text-fg-2">
            {preview ? "Preview of the image you chose. Save to check it and use it for new orders." : view.qrImageUrl ? "An uploaded QR code is used for new orders." : "Generated from the wallet address. This always matches it, so you don't need to upload anything."}
          </p>
          <p className="break-all font-mono text-[12px] text-fg-3">{view.recipient}</p>
          <input ref={input} type="file" accept={ACCEPT} className="sr-only" id="qr-file" onChange={(e) => choose(e.target.files?.[0] ?? null)} data-testid="qr-file" />
          <div className="flex flex-wrap gap-2">
            {preview ? (
              <>
                <Button size="sm" className="h-10" loading={busy === "upload"} disabled={busy !== null} onClick={upload}>
                  Save QR code
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-10"
                  disabled={busy !== null}
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                    if (input.current) input.current.value = "";
                  }}
                >
                  Discard
                </Button>
              </>
            ) : (
              <label htmlFor="qr-file" className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-tint/[0.04] px-4 text-[13.5px] font-medium text-fg transition-colors hover:border-tint/25 hover:bg-tint/[0.08] has-[:focus-visible]:shadow-[0_0_0_3px_var(--accent-glow)]">
                <ImageUp className="size-4" aria-hidden="true" />
                {view.qrImageUrl ? "Replace image" : "Upload image"}
              </label>
            )}
            {view.qrImageUrl && !preview ? (
              <Button variant="ghost" size="sm" className="h-10" loading={busy === "reset"} disabled={busy !== null} onClick={reset}>
                <RotateCcw className="size-4" aria-hidden="true" />
                Use generated QR
              </Button>
            ) : null}
          </div>
          <p className="text-[12px] text-fg-3">PNG, JPEG or WebP, up to 2 MB. Existing orders keep the QR code they were shown.</p>
          <FormError message={error} />
          {notice ? <FormNotice tone="success">{notice}</FormNotice> : null}
        </div>
      </div>
    </Section>
  );
}
