import type { Metadata } from "next";
import { LegalDocument, LegalLink, LegalMeta, type LegalSection, MailLink } from "@/components/legal/LegalDocument";
import { JsonLd } from "@/components/seo/JsonLd";
import { SubPage } from "@/components/sections/SubPage";
import { breadcrumbs, pageMetadata } from "@/lib/seo";
import { routes, site } from "@/lib/site";
import type { PassOffer } from "@/lib/offer";
import { launchFlags } from "@/server/launch";

export const metadata: Metadata = pageMetadata({
  title: "Terms of Service: Using Localians Preview Links",
  description: "The rules for using Localians: free 24-hour previews, the Preview Pass, payments and verification, acceptable use, availability and account suspension.",
  path: routes.terms,
});

/*
 * Decisions that still need the business owner / legal review before these terms are final (kept out of the public text):
 *  1. Refund policy: section 6 states no refund policy and promises no refund; one has to be approved and written.
 *  2. Governing law, venue and any arbitration: deliberately not specified (section 14).
 *  3. Liability limits: section 13 has only the generic disclaimer; no monetary cap has been approved.
 *  4. Minimum age: 18 (no approved policy exists; mirrored in the privacy policy).
 *  5. The operator's legal entity name, registration and postal address are not stated anywhere in the project.
 */
function buildSections(payments: boolean, offer: PassOffer): LegalSection[] {
  return [
    {
      id: "acceptance",
      title: "Acceptance of terms",
      body: (
        <>
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) are an agreement between you and {site.operator.name}, the operator of Localians (&ldquo;Localians&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;).
            By creating an account, running the Localians CLI, opening your dashboard or otherwise using Localians, you agree to these Terms and to our <LegalLink href={routes.privacy}>Privacy Policy</LegalLink>.
            If you use Localians on behalf of a company or team, you confirm you are allowed to accept these Terms for it. If you don&apos;t agree, please don&apos;t use the service.
          </p>
          <p>You must be at least 18 years old to create an account and use Localians.</p>
        </>
      ),
    },
    {
      id: "service",
      title: "The service",
      body: (
        <>
          <p>
            Localians lets you share a web application that runs on your own computer through a temporary HTTPS preview link. You start the app, run the Localians CLI (for example{" "}
            <code className="font-mono">npx localians share 3000</code>), and Localians connects visitors to your app through an encrypted tunnel. The service also includes a dashboard for projects, preview
            timers, password protection and traffic statistics, and any integrations we release.
          </p>
          <p>
            Localians provides connectivity. It does not host, copy or store your application. Some features are announced before they are available; we only offer the features that are shown as available in the product at the time.
          </p>
        </>
      ),
    },
    {
      id: "accounts",
      title: "Accounts",
      body: (
        <>
          <p>To use Localians you need an account. You agree to:</p>
          <ul>
            <li>give accurate information and keep it up to date;</li>
            <li>choose a username that is unique and doesn&apos;t impersonate anyone or infringe someone&apos;s rights;</li>
            <li>keep your password, CLI access and preview passwords secure, and not share your account;</li>
            <li>take responsibility for everything done through your account and the computers you have approved for the CLI;</li>
            <li>tell us promptly at <MailLink /> if you think someone has used your account without permission.</li>
          </ul>
        </>
      ),
    },
    {
      id: "free-plan",
      title: "Free preview plan",
      body: (
        <>
          <ul>
            <li>Each eligible project receives <strong>one free preview window of up to 24 hours</strong>.</li>
            <li>The window begins when the project is first shared, not when you create it.</li>
            <li>Stopping, restarting or reconnecting a preview, or sharing a different port or using a new setup code, does not reset or extend the window. The free window ends 24 hours after it began, even if you were offline for part of it.</li>
            <li>When a project&apos;s free window has been used, it can be shared again only with a pass or another entitlement we make available.</li>
            <li>Fair-use and anti-abuse limits apply to accounts and workspaces. These include a limit on how many new free windows you can start in a rolling 30-day period, on how many previews can run at once, on how many previews you can start per day and on daily preview traffic. We may change these limits to keep the service reliable and fair.</li>
            <li>Creating and deleting projects, or using several accounts, to obtain extra free windows is not allowed. We don&apos;t guarantee any additional free entitlements.</li>
          </ul>
        </>
      ),
    },
    {
      id: "preview-pass",
      title: "Preview Pass",
      body: (
        <>
          {!payments ? (
            <p>
              <strong>Availability:</strong> the {offer.name} is coming soon and can&apos;t be purchased yet. The description below explains how it will work once it is available in your dashboard.
            </p>
          ) : null}
          <p>
            The <strong>{offer.name} costs {offer.priceLabel} (US dollars), paid once</strong>. It is not a subscription and never renews or charges you automatically. It includes:
          </p>
          <ul>
            <li>{offer.daysLabel} of preview eligibility for <strong>one project you select</strong>;</li>
            <li>one reserved custom preview URL for that project while the pass is active (where custom URLs are enabled);</li>
            <li>password protection and the same dashboard features as the free plan.</li>
          </ul>
          <p>
            <strong>When it starts.</strong> The {offer.daysLabel} begin when we approve your payment and activate the pass, not when you place the order. If the project already has an active pass, the new one starts when the current one ends, so no paid time is lost.
          </p>
          <p>
            <strong>Renewing.</strong> To extend, buy another pass for the project from your dashboard. Nothing renews automatically.
          </p>
          <p>
            <strong>When it ends.</strong> Previews of the project stop when the pass ends, unless a further pass has been added. Your project and settings remain in your account. The custom URL stays reserved for you for 3 days after the pass ends so you can renew. After that it is released, and for a further 30 days only you can reclaim it before anyone else can.
          </p>
          <p>
            <strong>Limits.</strong> A pass applies to one project and can&apos;t be transferred to another project, workspace or person. A project&apos;s custom URL can be changed a limited number of times in a 30-day period. The fair-use limits on traffic and running previews apply to pass holders too.
            A pass gives you the right to share the project; it does not keep your computer or app online. The preview works only while your local app and the Localians CLI are running.
          </p>
        </>
      ),
    },
    {
      id: "payments",
      title: "Payments and verification",
      body: (
        <>
          <p>
            {payments
              ? "The pass is paid in USDT on the BNB Smart Chain (BEP20) network, using the payment details and Order ID shown in your dashboard."
              : "When purchases open, the pass is planned to be paid in USDT on the BNB Smart Chain (BEP20) network, using the payment details and Order ID shown in your dashboard."}{" "}
            Please read these rules carefully:
          </p>
          <ul>
            <li><strong>Follow the instructions exactly.</strong> Send the right token, in the right amount, to the right address, on the BNB Smart Chain network. Funds sent on a different network, in a different token or to a different address may be unrecoverable, and we can&apos;t recover them for you.</li>
            <li><strong>Verification and approval are required.</strong> A pass is activated only after we verify your payment on the blockchain and an administrator approves the order. Submitting a transaction hash or a screenshot doesn&apos;t guarantee activation, and we may ask for more information.</li>
            <li><strong>No false or duplicate evidence.</strong> Submitting forged, altered or reused payment evidence, or a transaction already used for another order, is prohibited and may lead to rejection and account suspension.</li>
            <li><strong>Network fees</strong> and any exchange or wallet charges are yours to pay; the pass price is the amount shown, received in full.</li>
            <li><strong>Pricing.</strong> Prices are set in US dollars and paid 1:1 in USDT (one USDT per dollar; {offer.priceLabel} is {offer.usdtLabel}). We may change the price or length for future orders; an order you have already created keeps the price and length shown when you created it.</li>
            <li><strong>Corrections and disputes.</strong> If you paid and haven&apos;t been activated, paid the wrong amount, or paid twice, email <MailLink /> with your Order ID and transaction hash. We&apos;ll review it and reply by email.</li>
          </ul>
          <p>
            <strong>Cancellation and refunds.</strong> Because a pass is a single payment, there is nothing to cancel. Blockchain transfers can&apos;t be reversed by us, so any refund would be a separate transfer from us, and the network&apos;s fees may apply. We haven&apos;t published a refund policy for passes. If you believe a payment was taken in error, for example a duplicate payment or a payment we received but couldn&apos;t activate, email <MailLink /> with your Order ID and we&apos;ll review the request and reply by email. Nothing in these Terms promises a refund, and nothing limits any refund or other rights that the law gives you.
          </p>
        </>
      ),
    },
    {
      id: "your-content",
      title: "Your applications and content",
      body: (
        <>
          <p>
            You keep ownership of your applications and everything they contain or serve. You are responsible for what you share through Localians and for having every right and permission needed to make it available, including for any code, data, content or third-party material in it.
          </p>
          <ul>
            <li>Preview links are reachable over the public internet. Anyone who has a public link, or the password to a protected one, can open it and can pass it on.</li>
            <li>Don&apos;t share apps that expose secrets, credentials, production data or other people&apos;s personal information unless you intend that and are allowed to.</li>
            <li>You grant us only the limited permission needed to transmit your app&apos;s traffic through our infrastructure and operate the service for you. See the <LegalLink href={routes.privacy}>Privacy Policy</LegalLink> for how preview traffic is handled.</li>
          </ul>
        </>
      ),
    },
    {
      id: "acceptable-use",
      title: "Acceptable use",
      body: (
        <>
          <p>You may not use Localians to:</p>
          <ul>
            <li>run phishing pages, impersonate a person, brand or organization, or mislead visitors about who is behind a page;</li>
            <li>distribute malware or malicious code;</li>
            <li>commit fraud or run scams;</li>
            <li>access, probe or interfere with systems, accounts or data without authorization, or attack other networks and services;</li>
            <li>send spam or abusive, harassing or hateful content, or share illegal material or content that exploits or endangers children;</li>
            <li>infringe copyright, trademarks or other rights;</li>
            <li>bypass or tamper with preview limits, timers, payment controls, authentication or other security protections, including by creating accounts or projects to obtain extra free windows;</li>
            <li>run production workloads, high-volume traffic or services that place an unreasonable load on Localians. Localians is for previews, not hosting.</li>
          </ul>
        </>
      ),
    },
    {
      id: "availability",
      title: "Availability",
      body: (
        <>
          <p>
            A preview works only when several things are working together: your computer and local app, your internet connection, the Localians CLI and the Localians infrastructure. If your computer sleeps, your app stops or your network drops, the preview shows as offline.
          </p>
          <p>
            We work to keep Localians reliable, but we don&apos;t promise uninterrupted or error-free service, a particular uptime, or that previews, traffic statistics or project data will be stored permanently. We may change, limit or pause features, and perform maintenance. Keep your own copy of your code and data.
          </p>
        </>
      ),
    },
    {
      id: "suspension",
      title: "Suspension and termination",
      body: (
        <>
          <p>
            You can stop using Localians at any time, stop a preview from your dashboard and ask us to delete your account at <MailLink />.
          </p>
          <p>
            We may stop a preview or suspend or terminate an account if we reasonably believe it breaks these Terms or the law, puts the service or other people at risk, involves fraudulent payment evidence or abuse of limits, or is unused or unpaid for in a way that requires it. Where it is reasonable and safe to do so, we may tell you why by email and give you a chance to respond. For serious or urgent risks, we may act first.
          </p>
        </>
      ),
    },
    {
      id: "intellectual-property",
      title: "Intellectual property",
      body: (
        <>
          <p>
            Localians, including its website, dashboard, CLI, design, logo and documentation, belongs to us or our licensors and is protected by intellectual property laws. We give you a limited, non-exclusive, non-transferable right to use the service as these Terms allow.
            The open-source license that covers the published <code className="font-mono">localians</code> CLI package applies to that package; it doesn&apos;t cover the Localians service. Your applications and content remain yours (see above). If you send us feedback, we may use it to improve the service without obligation to you.
          </p>
        </>
      ),
    },
    {
      id: "third-party",
      title: "Third-party services",
      body: (
        <p>
          Localians relies on third parties, such as hosting, email delivery, sign-in providers, open-source software and the BNB Smart Chain network and its explorers, which we don&apos;t control. Their outages, delays, fees or rule changes can affect Localians, including how quickly a payment can be verified, and
          we aren&apos;t responsible for them. Your use of their services is subject to their own terms.
        </p>
      ),
    },
    {
      id: "disclaimers",
      title: "Disclaimers and limits of liability",
      body: (
        <>
          <p>
            Localians is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the extent the law allows, we don&apos;t make warranties of any kind about it, including fitness for a particular purpose and uninterrupted or error-free operation, and we aren&apos;t liable for indirect or consequential losses, loss of data,
            profits or business, or for what visitors or third parties do with a public link you create.
          </p>
          <p>
            Nothing in these Terms excludes or limits liability that can&apos;t be excluded or limited by law, such as for fraud, or affects any mandatory consumer rights you have where you live.
          </p>
        </>
      ),
    },
    {
      id: "law",
      title: "Governing law and disputes",
      body: (
        <p>
          If you have a problem, please email <MailLink /> first so we can try to resolve it informally. These Terms don&apos;t currently name a governing law, court or arbitration process. The mandatory laws and consumer protections that apply where you live continue to apply.
        </p>
      ),
    },
    {
      id: "changes",
      title: "Changes to the service and these Terms",
      body: (
        <p>
          We may update the service and these Terms. If a change is material, we&apos;ll announce it in the dashboard or by email before it takes effect where we reasonably can, and update the date above. Using Localians after the change takes effect means you accept the updated Terms; if you don&apos;t, you can stop using it and ask us to delete your account.
        </p>
      ),
    },
    {
      id: "contact",
      title: "Contact",
      body: (
        <p>
          Questions about these Terms? Email <MailLink /> or visit our <LegalLink href={routes.contact}>contact page</LegalLink>.
        </p>
      ),
    },
  ];
}

/** Static, refreshed when an admin changes the payment setting (revalidatePath) and at least every 5 minutes. */
export const revalidate = 300;

export default async function TermsPage() {
  const { payments, offer } = await launchFlags();
  return (
    <SubPage
      eyebrow="Legal"
      title="Terms of Service"
      intro={
        <>
          The rules for using Localians to share your localhost.
          <LegalMeta />
        </>
      }
      width="wide"
    >
      <LegalDocument sections={buildSections(payments, offer)} />
      <JsonLd data={breadcrumbs([{ name: "Terms of Service", path: routes.terms }])} />
    </SubPage>
  );
}
