"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog } from "@/components/app/Dialog";
import { Field, FormError, inputClasses, Select, TextArea } from "@/components/app/Field";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { adminGrantPassAction, adminRevokePassAction } from "@/server/actions/admin";
import type { GrantReason, PlanManagement } from "@/server/plan-management";
import { Empty, fmtDate, Panel, Pill, statusLabel, statusTone } from "./Ui";

type Customer = { id: string; publicId: string; username: string | null; status: "ACTIVE" | "SUSPENDED" | "DELETED" };
type Pass = PlanManagement["projects"][number]["passes"][number];

const DAY = 86_400_000;
const SUPPORT_NOTE_MIN = 10;
const REASONS: { id: GrantReason; label: string; hint: string }[] = [
  { id: "VERIFIED_PAYMENT", label: "Verified payment", hint: "Activates an order that passed the on-chain check." },
  { id: "COMPLIMENTARY", label: "Complimentary access", hint: "No payment record is created. Labelled complimentary and audited." },
  { id: "SUPPORT_ADJUSTMENT", label: "Support adjustment", hint: "Compensation or a correction. An explanation is required." },
];
const reasonLabel = (p: Pass) => (p.reason === "VERIFIED_PAYMENT" ? `Verified payment${p.orderId ? ` · ${p.orderId}` : ""}` : p.reason === "COMPLIMENTARY" ? "Complimentary" : p.reason === "SUPPORT_ADJUSTMENT" ? "Support adjustment" : "Admin grant");
/** Read in event handlers only (the preview dates in the dialog). */
const clock = () => Date.now();
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-key`);

/**
 * Manage Plan: per-project Preview Passes for one customer. Upgrading or renewing goes through a confirmation screen;
 * the server re-checks everything (admin session, ownership, verified order, note) and is idempotent per dialog.
 */
export function ManagePlan({ customer, data }: { customer: Customer; data: PlanManagement }) {
  const router = useRouter();
  const eligible = data.projects.filter((p) => !p.archived);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [projectId, setProjectId] = useState(eligible[0]?.id ?? "");
  const [reason, setReason] = useState<GrantReason>("COMPLIMENTARY");
  const [orderId, setOrderId] = useState("");
  const [note, setNote] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [revoking, setRevoking] = useState<{ pass: Pass; project: string } | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [now, setNow] = useState(0);

  const project = eligible.find((p) => p.id === projectId) ?? null;
  const orders = data.orders.filter((o) => o.activatable && o.projectId === projectId);
  const order = orders.find((o) => o.orderId === orderId) ?? null;
  const days = reason === "VERIFIED_PAYMENT" ? (order?.days ?? data.offer.days) : data.offer.days;
  const planName = reason === "VERIFIED_PAYMENT" && order ? order.passName : data.offer.name;
  // The preview of the dates uses the time the dialog step was shown; the server sets the exact dates on confirm.
  const periodStart = project?.paidUntil && new Date(project.paidUntil).getTime() > now ? new Date(project.paidUntil) : new Date(now);
  const period = { start: periodStart, end: new Date(periodStart.getTime() + days * DAY), renewal: periodStart.getTime() > now };
  const noteTooShort = reason === "SUPPORT_ADJUSTMENT" && note.trim().length < SUPPORT_NOTE_MIN;
  const canContinue = !!project && (reason !== "VERIFIED_PAYMENT" || !!order) && !noteTooShort;

  function start(forProject?: string) {
    const id = forProject ?? (eligible.some((p) => p.id === projectId) ? projectId : (eligible[0]?.id ?? ""));
    setProjectId(id);
    const verified = data.orders.find((o) => o.activatable && o.projectId === id);
    setReason(verified ? "VERIFIED_PAYMENT" : "COMPLIMENTARY");
    setOrderId(verified?.orderId ?? "");
    setNote("");
    setError(null);
    setStep("form");
    setKey(newKey()); // one key per dialog: repeated or concurrent submits activate once
    setNow(clock());
    setOpen(true);
  }

  function pickProject(id: string) {
    setProjectId(id);
    const verified = data.orders.find((o) => o.activatable && o.projectId === id);
    setOrderId(verified?.orderId ?? "");
    if (reason === "VERIFIED_PAYMENT" && !verified) setReason("COMPLIMENTARY");
  }

  async function confirmGrant() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await adminGrantPassAction({ userId: customer.id, projectId, reason, orderId: reason === "VERIFIED_PAYMENT" ? orderId : null, note: reason === "VERIFIED_PAYMENT" ? null : note, key }).catch(() => ({
      ok: false as const,
      error: "Something went wrong.",
    }));
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const d = result.data;
    setOpen(false);
    setMessage({
      ok: true,
      text: d.duplicate
        ? `Already activated: ${project?.name} has this pass until ${fmtDate(new Date(d.endsAt))}.`
        : `${planName} ${d.renewal ? "added" : "activated"} for ${project?.name}: ${fmtDate(new Date(d.startsAt))} → ${fmtDate(new Date(d.endsAt))}. The customer was emailed.`,
    });
    router.refresh();
  }

  async function confirmRevoke() {
    if (!revoking || busy) return;
    setBusy(true);
    setError(null);
    const result = await adminRevokePassAction({ userId: customer.id, passId: revoking.pass.id, reason: revokeReason }).catch(() => ({ ok: false as const, error: "Something went wrong." }));
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage({ ok: true, text: result.data.revoked ? `Pass revoked on ${revoking.project}. The customer was emailed.` : "That pass was already revoked." });
    setRevoking(null);
    router.refresh();
  }

  const disabledReason = customer.status !== "ACTIVE" ? "Reactivate this account to change its plan." : !eligible.length ? "This user has no active projects." : null;

  return (
    <>
      <Panel
        title="Plan"
        action={
          <Button size="sm" className="h-9" onClick={() => start()} disabled={!!disabledReason} data-testid="manage-plan">
            Manage Plan
          </Button>
        }
      >
        <div className="flex flex-col divide-y divide-line" data-testid="plan-panel">
          {message ? (
            <p role="status" className={cn("px-5 py-3 text-[13px]", message.ok ? "text-accent-ink" : "text-danger")} data-testid="plan-message">
              {message.text}
            </p>
          ) : null}
          {disabledReason ? <p className="px-5 py-3 text-[13px] text-fg-3">{disabledReason}</p> : null}
          {data.projects.length ? (
            <ul className="divide-y divide-line">
              {data.projects.map((p) => (
                <li key={p.id} className="flex flex-col gap-2 px-5 py-3 text-[13.5px]" data-testid="plan-project">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-fg">
                      {p.name}
                      {p.archived ? <span className="text-fg-3"> · archived</span> : null}
                      {p.customUrl ? <span className="font-mono text-[12.5px] text-fg-3"> · {p.customUrl}</span> : null}
                    </span>
                    <span className="flex items-center gap-2">
                      {p.paid ? <Pill tone="live">Paid</Pill> : <Pill tone="off">Free{p.freeState === "used" ? " · trial used" : p.freeState === "active" ? " · trial running" : ""}</Pill>}
                      {!p.archived && !disabledReason ? (
                        <Button size="sm" variant="ghost" className="h-8 px-2.5 text-[12.5px]" onClick={() => start(p.id)} aria-label={`${p.paid || p.passes.length ? "Renew" : "Upgrade"} ${p.name}`}>
                          {p.paid || p.passes.length ? "Renew / extend" : "Upgrade"}
                        </Button>
                      ) : null}
                    </span>
                  </div>
                  {p.passes.length ? (
                    <ul className="flex flex-col gap-1.5">
                      {p.passes.map((x) => (
                        <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-tint/[0.02] px-3 py-2 text-[12.5px]" data-testid="plan-pass">
                          <span className="min-w-0 text-fg-2">
                            <span className="text-fg">{x.current ? "Active" : "Scheduled"}</span> · {fmtDate(new Date(x.startsAt))} → {fmtDate(new Date(x.endsAt))}
                            <span className="block text-fg-3">
                              {reasonLabel(x)}
                              {x.note ? ` — ${x.note}` : ""}
                            </span>
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2.5 text-[12.5px] text-danger"
                            onClick={() => {
                              setRevokeReason("");
                              setError(null);
                              setRevoking({ pass: x, project: p.name });
                            }}
                          >
                            Revoke…
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No projects.</Empty>
          )}
        </div>
      </Panel>

      <Panel title="Payment history">
        {data.orders.length ? (
          <ul className="divide-y divide-line" data-testid="payment-history">
            {data.orders.map((o) => (
              <li key={o.orderId} className="flex flex-col gap-1 px-5 py-3 text-[13px] sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">
                  <Link href={`/admin/payments/${o.orderId}`} className="font-mono text-fg hover:text-accent-ink">
                    {o.orderId}
                  </Link>
                  <span className="block text-[12.5px] text-fg-3">
                    {o.projectName} · {o.passName} · {o.amount} · {fmtDate(new Date(o.createdAt))}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {o.activatable ? <Pill tone="live">Verified</Pill> : null}
                  <Pill tone={statusTone(o.status)}>{statusLabel(o.status)}</Pill>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No orders. Complimentary and support passes never create payment records.</Empty>
        )}
      </Panel>

      <Dialog open={open} onClose={() => setOpen(false)} title={step === "form" ? "Manage Plan" : "Confirm the change"} busy={busy} className="max-w-[520px]">
        <div className="flex flex-col gap-4 text-[13.5px] text-fg-2" data-testid="plan-dialog">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-fg-3">
            <span className="font-mono text-fg">{customer.publicId}</span>
            <span>{customer.username ? `@${customer.username}` : "no username"}</span>
            <Pill tone={statusTone(customer.status)}>{customer.status.toLowerCase()}</Pill>
          </p>

          {step === "form" ? (
            <>
              <Field label="Project" hint={project ? (project.paidUntil ? `Paid until ${fmtDate(new Date(project.paidUntil))}. A renewal starts when that ends.` : "Free plan. The pass starts when you confirm.") : undefined}>
                {(p) => (
                  <Select {...p} value={projectId} onChange={(e) => pickProject(e.target.value)}>
                    {eligible.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} — {x.paid ? "Paid" : "Free"}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-[13.5px] font-medium text-fg">Reason</legend>
                {REASONS.map((r) => {
                  const off = r.id === "VERIFIED_PAYMENT" && !orders.length;
                  return (
                    <label key={r.id} className={cn("flex cursor-pointer gap-3 rounded-xl border px-3.5 py-2.5", reason === r.id ? "border-accent/50 bg-accent/[0.06]" : "border-line", off && "cursor-not-allowed opacity-55")}>
                      <input
                        type="radio"
                        name="grant-reason"
                        value={r.id}
                        checked={reason === r.id}
                        disabled={off}
                        onChange={() => {
                          setReason(r.id);
                          if (r.id === "VERIFIED_PAYMENT") setOrderId(orders[0]?.orderId ?? "");
                        }}
                        className="mt-0.5 accent-[var(--accent)]"
                      />
                      <span>
                        <span className="block font-medium text-fg">{r.label}</span>
                        <span className="block text-[12.5px] text-fg-3">{off ? "No verified order for this project. Verify one on its order page first." : r.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>

              {reason === "VERIFIED_PAYMENT" ? (
                <Field label="Verified order">
                  {(p) => (
                    <Select {...p} value={orderId} onChange={(e) => setOrderId(e.target.value)}>
                      {orders.map((o) => (
                        <option key={o.orderId} value={o.orderId}>
                          {o.orderId} — {o.amount} · {o.passName}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              ) : (
                <Field
                  label={reason === "SUPPORT_ADJUSTMENT" ? "Explanation" : "Internal note"}
                  optional={reason === "COMPLIMENTARY"}
                  hint={reason === "SUPPORT_ADJUSTMENT" ? `Required, at least ${SUPPORT_NOTE_MIN} characters. Kept in the audit log, not sent to the customer.` : "Kept in the audit log, not sent to the customer."}
                >
                  {(p) => <TextArea {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="min-h-[72px]" />}
                </Field>
              )}

              <p className="rounded-xl border border-line bg-tint/[0.02] px-3.5 py-2.5 text-[12.5px] text-fg-3">
                {data.customNames
                  ? project?.customUrl
                    ? `Custom URL ${project.customUrl} stays with the project.`
                    : "The customer can claim a custom URL from their dashboard once the pass is active."
                  : "Custom URLs aren't routed by the gateways yet, so the preview keeps its random link."}
              </p>

              <FormError message={error} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" disabled={!canContinue} onClick={() => {
                    setNow(clock());
                    setStep("confirm");
                  }}>
                  Continue
                </Button>
              </div>
            </>
          ) : (
            <>
              <dl className="divide-y divide-line overflow-hidden rounded-xl border border-line" data-testid="plan-confirm">
                {(
                  [
                    ["Project", project?.name ?? ""],
                    ["Plan", `${planName} (this project only)`],
                    ["Reason", REASONS.find((r) => r.id === reason)!.label + (reason === "VERIFIED_PAYMENT" && order ? ` · ${order.orderId}` : "")],
                    [period.renewal ? "Starts (renewal)" : "Activates", period.renewal ? fmtDate(period.start) : "Now"],
                    ["Expires", fmtDate(period.end)],
                    ...(reason !== "VERIFIED_PAYMENT" && note.trim() ? [["Note", note.trim()]] : []),
                  ] as [string, string][]
                ).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 px-3.5 py-2.5 text-[13px]">
                    <dt className="text-fg-3">{k}</dt>
                    <dd className="min-w-0 text-right text-fg [overflow-wrap:anywhere]">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-[12.5px] text-fg-3">The customer is emailed. Live previews of this project are extended right away. Exact dates are set by the server when you confirm.</p>
              <FormError message={error} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep("form")} disabled={busy}>
                  Back
                </Button>
                <Button size="sm" loading={busy} onClick={() => void confirmGrant()} data-testid="plan-confirm-button">
                  {period.renewal ? "Confirm renewal" : "Confirm upgrade"}
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>

      <Dialog open={!!revoking} onClose={() => setRevoking(null)} title="Revoke this pass?" busy={busy} className="max-w-[460px]">
        {revoking ? (
          <div className="flex flex-col gap-4 text-[13.5px] text-fg-2">
            <p>
              {revoking.project}: {fmtDate(new Date(revoking.pass.startsAt))} → {fmtDate(new Date(revoking.pass.endsAt))} ({reasonLabel(revoking.pass)}). Later passes move up, and live previews are cut back or
              stopped now.{revoking.pass.reason === "VERIFIED_PAYMENT" ? " This was paid for: refund the customer separately." : ""}
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-fg">Reason (sent to the customer and kept in the audit log)</span>
              <input value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} className={`${inputClasses} h-10`} maxLength={200} data-autofocus />
            </label>
            <FormError message={error} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRevoking(null)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" loading={busy} disabled={revokeReason.trim().length < 3} onClick={() => void confirmRevoke()}>
                Revoke pass
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
