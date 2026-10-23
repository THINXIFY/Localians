import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_OFFER, makeOffer } from "@/lib/offer";
import { qrPath } from "@/lib/payment-qr";
import type { PaymentInfo, PlanSummary } from "@/lib/plans";

// The dialog is rendered on its own: no Next.js router or server actions behind it.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, replace: () => undefined, push: () => undefined }) }));
vi.mock("@/server/actions/upgrades", () => ({ requestUpgradeAction: vi.fn(), submitTxHashAction: vi.fn(), cancelUpgradeAction: vi.fn() }));

const { UpgradeDialog } = await import("@/components/app/plans/UpgradeDialog");

const WALLET = "0x2f94b75535eff533378c90f8dda29cf10208b174";
const plan = (request: PlanSummary["request"] = null): PlanSummary => ({ free: { state: "used", endedAt: new Date().toISOString() }, pass: null, graceUntil: null, request, canShare: false, freeLimit: 3 });
const payment = (enabled: boolean): PaymentInfo => ({
  enabled,
  offer: DEFAULT_OFFER,
  amountLabel: "5 USDT",
  networkLabel: "BNB Smart Chain (BEP20)",
  recipient: enabled ? WALLET : null,
  qr: enabled ? qrPath(WALLET) : null,
  qrImageUrl: null,
  supportEmail: "hello@thinxify.com",
  afterPaymentMessage: "After payment, email your payment screenshot, transaction hash, Localians username and Order ID to hello@thinxify.com. Your 7-Day Preview Pass will activate after successful payment verification.",
});
const render = (p: PaymentInfo, pl: PlanSummary) =>
  renderToStaticMarkup(createElement(UpgradeDialog, { open: true, onClose: () => undefined, project: { id: "p1", name: "Agent Axio" }, plan: pl, payment: p, previewDomain: "preview.localians.com", hasCustomName: false }));

describe("Upgrade dialog", () => {
  it("with payments off: plan and price, 'Payments coming soon', no deposit address, no way to order or pay", () => {
    const html = render(payment(false), plan());
    expect(html).toContain("7 more days of sharing for this project");
    expect(html).toContain("$5");
    expect(html).toContain("one-time · 7 days");
    expect(html).toContain("Payments coming soon");
    expect(html).not.toContain(WALLET);
    expect(html).not.toContain("QR code for the wallet address");
    expect(html).not.toContain("<svg role=\"img\"");
    expect(html).not.toContain("Get my Order ID");
    expect(html).not.toContain("Transaction hash");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*Pay 5 USDT — coming soon/);
  });

  it("with payments on: the wallet, QR, amount and network are shown as soon as the dialog opens", () => {
    const html = render(payment(true), plan());
    expect(html).toContain(WALLET);
    expect(html).toContain("Copy wallet address");
    expect(html).toContain(`aria-label="QR code for the wallet address ${WALLET}"`);
    expect(html).toContain("5 USDT");
    expect(html).toContain("BNB Smart Chain (BEP20)");
    expect(html).toContain("Send USDT on BNB Smart Chain (BEP20) only");
    expect(html).toContain("Get my Order ID");
    expect(html).toContain("Your custom URL (optional)");
    expect(html).not.toContain("Transaction hash"); // the hash goes with an order
  });

  // An order made before the admin changed the wallet: it must keep showing (and paying to) its own snapshot.
  const ORDER_WALLET = "0x1111111111111111111111111111111111111111";
  const payTo = { recipient: ORDER_WALLET, qr: qrPath(ORDER_WALLET), qrImageUrl: null };

  it("with an open order: Order ID, amount, network, the ORDER's wallet + copy and QR, warning, email instructions, hash field and status", () => {
    const html = render(payment(true), plan({ orderId: "ORD-ABCDEFGH", status: "PENDING", txHash: null, note: null, payTo }));
    for (const text of ["ORD-ABCDEFGH", "5 USDT", "BNB Smart Chain (BEP20)", ORDER_WALLET, "Copy wallet address", "Send USDT on BNB Smart Chain (BEP20) only", "Transaction hash", "Pending", "Cancel this order"]) {
      expect(html, text).toContain(text);
    }
    expect(html).not.toContain(WALLET); // never the current global wallet for an existing order
    expect(html).toContain(`aria-label="QR code for the wallet address ${ORDER_WALLET}"`);
    expect(html).toContain("After payment, email your payment screenshot, transaction hash, Localians username and Order ID to hello@thinxify.com.");
    expect(html).toContain("mailto:hello@thinxify.com?subject=Payment%20for%20ORD-ABCDEFGH");
  });

  it("an order's verified uploaded QR image is shown instead of the generated one", () => {
    const html = render(payment(true), plan({ orderId: "ORD-ABCDEFGH", status: "PENDING", txHash: null, note: null, payTo: { ...payTo, qrImageUrl: "/api/media/payment-qr/abc123abc123abc123abc1" } }));
    expect(html).toContain('src="/api/media/payment-qr/abc123abc123abc123abc1"');
    expect(html).toContain(`alt="QR code for the wallet address ${ORDER_WALLET}"`);
  });

  it("payments off with an open order: status and hash field stay, but no wallet or QR is shown", () => {
    const html = render(payment(false), plan({ orderId: "ORD-ABCDEFGH", status: "PENDING", txHash: null, note: null, payTo: null }));
    expect(html).toContain("ORD-ABCDEFGH");
    expect(html).toContain("New payments are paused");
    expect(html).toContain("Transaction hash");
    expect(html).not.toContain("QR code for the wallet address");
    expect(html).not.toContain("Copy wallet address");
  });

  it("after a hash was submitted: awaiting verification, no cancel", () => {
    const html = render(payment(true), plan({ orderId: "ORD-ABCDEFGH", status: "UNDER_REVIEW", txHash: `0x${"ab".repeat(32)}`, note: null }));
    expect(html).toContain("Under review");
    expect(html).toContain("We&#x27;ll verify the transfer on BSC");
    expect(html).not.toContain("Cancel this order");
  });

  it("an open order keeps the price and length it was created with, even after the admin changes pricing", () => {
    const current = { ...payment(true), offer: makeOffer(12_000_000n, 30), amountLabel: "12 USDT" };
    const html = render(current, plan({ orderId: "ORD-OLDPRICE", status: "PENDING", txHash: null, note: null, payTo: { ...payTo, offer: DEFAULT_OFFER } }));
    expect(html).toContain("7-Day Preview Pass");
    expect(html).toContain("$5");
    expect(html).toContain("5 USDT");
    expect(html).not.toContain("$12");
    expect(html).not.toContain("30-Day");
  });

  it("a new order shows the current admin price", () => {
    const html = render({ ...payment(true), offer: makeOffer(12_000_000n, 30), amountLabel: "12 USDT" }, plan());
    for (const text of ["30-Day Preview Pass", "$12", "12 USDT", "30 more days of sharing for this project"]) expect(html, text).toContain(text);
  });
});
