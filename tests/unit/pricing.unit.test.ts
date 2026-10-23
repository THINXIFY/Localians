import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildFaqs, Pricing } from "@/components/sections/Pricing";
import { Features } from "@/components/sections/Features";
import { DEFAULT_OFFER, makeOffer } from "@/lib/offer";

const WALLET = "0x2f94b75535eff533378c90f8dda29cf10208b174";
const pricing = (payments: boolean, customUrls: boolean) => renderToStaticMarkup(createElement(Pricing, { payments, customUrls, vscode: false, offer: DEFAULT_OFFER }));

describe("landing pricing and features only advertise what's live", () => {
  it("payments off (production today): Coming Soon instead of a checkout, no wallet, custom URLs marked soon", () => {
    const html = pricing(false, false);
    expect(html).toContain("$5");
    expect(html).toContain("one-time · 7 days");
    expect(html).toContain("not a subscription");
    expect(html).toContain("Coming Soon");
    expect(html).not.toContain("Upgrade for $5");
    expect(html).not.toContain("/dashboard/settings/billing");
    expect(html).toContain("Custom URL (soon)");
    expect(html).not.toContain(WALLET);
    expect(buildFaqs({ payments: false, customUrls: false, vscode: false, offer: DEFAULT_OFFER }).find((f) => f.question === "How is the payment verified?")!.answer).toContain("coming soon");
  });

  it("payments and custom URLs on: Upgrade for $5 goes to the dashboard checkout (still no wallet on the page)", () => {
    const html = pricing(true, true);
    expect(html).toContain("Upgrade for $5");
    expect(html).toContain('href="/dashboard/settings/billing"');
    expect(html).not.toContain("Coming Soon");
    expect(html).toContain("Your custom URL");
    expect(html).not.toContain(WALLET);
    expect(buildFaqs({ payments: true, customUrls: true, vscode: false, offer: DEFAULT_OFFER }).find((f) => f.question === "How is the payment verified?")!.answer).toContain("BNB Smart Chain (BEP20)");
  });

  it("features: VS Code is marked Coming soon until released; custom URLs follow their flag", () => {
    const off = renderToStaticMarkup(createElement(Features, { customUrls: false, vscode: false }));
    expect((off.match(/Coming soon/g) ?? []).length).toBe(2);
    const on = renderToStaticMarkup(createElement(Features, { customUrls: true, vscode: false }));
    expect((on.match(/Coming soon/g) ?? []).length).toBe(1);
    expect(on).toContain("npx localians share 3000");
  });

  it("an admin price change flows through: price, USDT amount, length and name everywhere in the section", () => {
    const offer = makeOffer(9_990_000n, 14);
    const html = renderToStaticMarkup(createElement(Pricing, { payments: true, customUrls: true, vscode: false, offer }));
    for (const text of ["$9.99", "one-time · 14 days", "14-Day Preview Pass", "Upgrade for $9.99", "14 more days per project"]) expect(html, text).toContain(text);
    expect(html).not.toMatch(/$5|7 days|7-Day/);
    const faqs = buildFaqs({ payments: true, customUrls: true, vscode: false, offer });
    expect(faqs.find((f) => f.question.includes("Preview Pass"))?.question).toBe("What is the $9.99 14-Day Preview Pass?");
    expect(faqs.find((f) => f.question === "How is the payment verified?")!.answer).toContain("9.99 USDT");
  });
});
