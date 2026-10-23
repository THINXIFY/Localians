import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PaymentInfo, PlanSummary } from "@/lib/plans";

// The dialog is rendered on its own: no Next.js router or server actions behind it.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, replace: () => undefined, push: () => undefined }) }));
vi.mock("@/server/actions/upgrades", () => ({ requestUpgradeAction: vi.fn(), submitTxHashAction: vi.fn(), cancelUpgradeAction: vi.fn() }));

const { UpgradeDialog } = await import("@/components/app/plans/UpgradeDialog");

const WALLET = "0x2f94b75535eff533378c90f8dda29cf10208b174";
const plan = (request: PlanSummary["request"] = null): PlanSummary => ({ free: { state: "used", endedAt: new Date().toISOString() }, pass: null, graceUntil: null, request, canShare: false, freeLimit: 3 });
const payment = (enabled: boolean): PaymentInfo => ({
  enabled,
  amountLabel: "5 USDT",
  networkLabel: "BNB Smart Chain (BEP20)",
  recipient: enabled ? WALLET : null,
  qrUrl: enabled ? "/images/payment/usdt-bsc-qr.jpg" : null,
  supportEmail: "hello@thinxify.com",
  afterPaymentMessage: "Please send your payment screenshot, transaction hash, Localians username and Order ID to hello@thinxify.com. Your 7-Day Preview Pass will activate after payment verification.",
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
    expect(html).not.toContain("usdt-bsc-qr");
    expect(html).not.toContain("Get my Order ID");
    expect(html).not.toContain("Transaction hash");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*Pay 5 USDT — coming soon/);
  });

  it("with payments on: the wallet, QR, amount and network are shown as soon as the dialog opens", () => {
    const html = render(payment(true), plan());
    expect(html).toContain(WALLET);
    expect(html).toContain("Copy wallet address");
    expect(html).toContain('src="/images/payment/usdt-bsc-qr.jpg"');
    expect(html).toContain("5 USDT");
    expect(html).toContain("BNB Smart Chain (BEP20)");
    expect(html).toContain("Send USDT on BNB Smart Chain (BEP20) only");
    expect(html).toContain("Get my Order ID");
    expect(html).toContain("Your custom URL (optional)");
    expect(html).not.toContain("Transaction hash"); // the hash goes with an order
  });

  it("with an open order: Order ID, amount, network, wallet + copy, QR, warning, email instructions, hash field and status", () => {
    const html = render(payment(true), plan({ orderId: "ORD-ABCDEFGH", status: "PENDING", txHash: null, note: null }));
    for (const text of ["ORD-ABCDEFGH", "5 USDT", "BNB Smart Chain (BEP20)", WALLET, "Copy wallet address", "Send USDT on BNB Smart Chain (BEP20) only", "Transaction hash", "Pending", "Cancel this order"]) {
      expect(html, text).toContain(text);
    }
    expect(html).toContain('src="/images/payment/usdt-bsc-qr.jpg"');
    expect(html).toContain("Please send your payment screenshot, transaction hash, Localians username and Order ID to hello@thinxify.com.");
    expect(html).toContain("mailto:hello@thinxify.com?subject=Payment%20for%20ORD-ABCDEFGH");
  });

  it("after a hash was submitted: awaiting verification, no cancel", () => {
    const html = render(payment(true), plan({ orderId: "ORD-ABCDEFGH", status: "UNDER_REVIEW", txHash: `0x${"ab".repeat(32)}`, note: null }));
    expect(html).toContain("Under review");
    expect(html).toContain("We&#x27;ll verify the transfer on BSC");
    expect(html).not.toContain("Cancel this order");
  });
});
