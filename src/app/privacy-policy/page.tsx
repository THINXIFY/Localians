import type { Metadata } from "next";
import { LegalDocument, LegalLink, LegalMeta, type LegalSection, MailLink } from "@/components/legal/LegalDocument";
import { JsonLd } from "@/components/seo/JsonLd";
import { SubPage } from "@/components/sections/SubPage";
import { breadcrumbs, pageMetadata } from "@/lib/seo";
import { routes, site } from "@/lib/site";
import { launchFlags } from "@/server/launch";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy: How Localians Handles Your Data",
  description: "What Localians collects for accounts, previews and payments, how preview traffic is handled, our providers, data retention, and how to reach us about your data.",
  path: routes.privacy,
});

/*
 * Written from what the implementation does (account/session/tunnel/upgrade tables, the gateway logger, Better Auth,
 * Resend, the BSC verification). Items the business owner still has to decide are listed in the commit/PR notes:
 * legal entity details, log retention at the host, a self-service deletion flow, and any fixed retention periods.
 */
function buildSections(payments: boolean): LegalSection[] {
  return [
  {
    id: "introduction",
    title: "Introduction",
    body: (
      <>
        <p>
          Localians gives developers temporary HTTPS preview links for web applications running on their own computers. You start your app locally,
          run a command, and Localians makes it reachable at a link you can share with a client or teammate. This policy explains what information
          Localians handles to do that, why, and what choices you have.
        </p>
        <p>
          Localians is built and operated by <a href={site.operator.url} className="text-fg underline decoration-white/25 underline-offset-4 hover:decoration-accent" target="_blank" rel="noopener noreferrer">{site.operator.name}</a>.
          In this policy, &ldquo;Localians&rdquo;, &ldquo;we&rdquo; and &ldquo;us&rdquo; mean that operator running the service at localians.com and its
          preview domain. We don&apos;t publish a registered company number or postal address on this page; you can reach us at <MailLink />.
        </p>
        <p>
          This policy covers the Localians website, dashboard, command-line tool (CLI) and preview links. It does not cover the applications you share
          or third-party sites you link to from them.
        </p>
      </>
    ),
  },
  {
    id: "information-we-collect",
    title: "Information we collect",
    body: (
      <>
        <p>We collect only what the service needs. In practice that is:</p>
        <ul>
          <li>
            <strong>Account information:</strong> your name, email address, a username if you choose one, and a user ID (like <code className="font-mono">LOC-000123</code>)
            that we assign. If you sign up with a password, we store a one-way hash of it, never the password itself. If you sign in with GitHub (where offered),
            we receive the basic profile details GitHub shares with us, such as your name, email and avatar. You can also add a profile picture as an image link.
          </li>
          <li>
            <strong>Authentication and session information:</strong> session records with the IP address and browser/device description (user agent) they were created from,
            email verification and password-reset tokens, and, for the CLI, the name of each computer you approve and the time it was last used. CLI access tokens and
            one-time setup codes are stored as hashes.
          </li>
          <li>
            <strong>Projects and preview settings:</strong> project names and descriptions, the local port and framework you choose, whether a preview is public or
            password protected (preview passwords are stored as hashes), preview URLs and custom URL names, timers, session durations, and which plan applies to a project.
          </li>
          <li>
            <strong>Usage and technical information:</strong> when a preview connected, disconnected or expired and why; the number of requests and the amount of data
            a preview transferred, in short time buckets; and an activity trail of important actions such as passes being activated or accounts being suspended. IP addresses
            are also used, briefly, as keys for rate limiting (sign-in attempts, CLI requests and preview-password attempts). Our servers record errors as structured logs
            that include the request path but not headers, cookies or bodies. Website usage measured by Google Analytics is described under Cookies and similar technologies.
          </li>
          <li>
            <strong>Upgrade orders and payment records:</strong> for a Preview Pass order, the Order ID, project, amount, currency and network, any custom URL you
            requested, the transaction hash you provide, the result of our blockchain check, the review status and notes, and timestamps. See{" "}
            <a href="#payments-and-blockchain" className="text-fg underline decoration-white/25 underline-offset-4 hover:decoration-accent">Payments and blockchain</a>.
          </li>
          <li>
            <strong>Support communications:</strong> messages you email to <MailLink />, including anything you attach.
          </li>
          <li>
            <strong>Other information you choose to give us</strong>, for example in a bug report.
          </li>
        </ul>
        <p>
          We don&apos;t run a contact form, and the marketing site doesn&apos;t collect personal information through forms. Your browser also remembers a few
          convenience settings on your own device (for example your last sharing options in the dashboard); these stay in your browser and aren&apos;t sent to us.
        </p>
      </>
    ),
  },
  {
    id: "localhost-preview-data",
    title: "Localhost preview data",
    body: (
      <>
        <p>
          When you share an app, you deliberately make it reachable from the public internet. Visitors who open your preview link connect to Localians over HTTPS,
          and our gateway forwards each request through the encrypted tunnel your CLI opened to your computer, then returns your app&apos;s response.
        </p>
        <p>
          <strong>Preview content passes through our servers.</strong> Because the gateway sits between the visitor and your computer, it handles the requests and
          responses in order to forward them, including their content, while they are in transit. We don&apos;t say that Localians is unable to see preview traffic:
          that would not be accurate. We don&apos;t store the bodies of your requests or responses, and our gateway logs are written to contain metadata only.
        </p>
        <p>What we do record about preview traffic is limited to metadata:</p>
        <ul>
          <li>the preview&apos;s label (its hostname), the HTTP method, the request path with any query string replaced by <code className="font-mono">[redacted]</code>, the response status and how long it took;</li>
          <li>connection events (connected, disconnected, expired, stopped), and counts of requests and bytes per preview in short time buckets, used for your dashboard and fair-use limits.</li>
        </ul>
        <p>
          <strong>Public and password-protected previews.</strong> A public preview can be opened by anyone who has the link. A password-protected preview asks visitors for the
          password you set before showing your app. After a correct password, the gateway sets a cookie on that preview only, valid for the duration you choose, and
          removes it from requests before they reach your app. Changing the password or choosing &ldquo;sign out all visitors&rdquo; invalidates those cookies. Wrong
          passwords are rate limited per visitor IP address. Password protection controls who can open the link; it is not a substitute for securing the app itself.
        </p>
        <p>
          <strong>Your responsibility.</strong> You decide what your preview exposes. Don&apos;t share an app that contains real customer data, production credentials, API keys or other
          secrets, and remember that anyone with a public link, or the password, can pass it on. Your app, and anything it sets, such as its own cookies, is yours; we don&apos;t control it.
        </p>
      </>
    ),
  },
  {
    id: "how-we-use-information",
    title: "How we use information",
    body: (
      <>
        <p>We use the information described above to:</p>
        <ul>
          <li>create and secure your account, verify your email address and sign you in;</li>
          <li>connect your computer to the gateway, create and stop preview links, enforce preview timers and plan limits, and show you your projects and traffic;</li>
          <li>answer support requests and troubleshoot problems you report;</li>
          <li>protect the service: rate limiting, detecting abuse and sign-in attacks, enforcing our <LegalLink href={routes.terms}>Terms of Service</LegalLink> and suspending accounts or previews when necessary;</li>
          <li>verify upgrade payments, review them, and activate, extend or revoke passes and custom URLs;</li>
          <li>monitor reliability and fix errors;</li>
          <li>understand how the website is used (Google Analytics, with cookies only if you accept; see Cookies and similar technologies);</li>
          <li>send service emails, such as verification, password-reset, security and order messages. We don&apos;t send marketing email;</li>
          <li>meet legal obligations and respond to valid legal requests where they apply.</li>
        </ul>
        <p>We don&apos;t sell your personal information and we don&apos;t use it for advertising.</p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and similar technologies",
    body: (
      <>
        <p>Localians uses the cookies and browser storage it needs to work, and, only if you accept, Google Analytics cookies:</p>
        <ul>
          <li>
            <strong>Sign-in session cookie.</strong> When you sign in, we set an HTTP-only session cookie (named with a <code className="font-mono">__Host-localians</code> prefix on the live
            site) that keeps you signed in for up to 30 days unless you sign out. It is restricted to our own host, sent only over HTTPS and never readable by page scripts.
          </li>
          <li>
            <strong>Preview access cookie.</strong> On a password-protected preview, a visitor who enters the correct password receives an HTTP-only cookie for that preview only.
          </li>
          <li>
            <strong>Local browser storage.</strong> The dashboard may remember your last sharing choices in your browser&apos;s local storage, and the website remembers your cookie choice
            there. It is not sent to us.
          </li>
          <li>
            <strong>Google Analytics cookies (optional).</strong> If you click <em>Accept</em> in the cookie banner, Google Analytics sets cookies (such as <code className="font-mono">_ga</code>)
            to count visits and see which pages are used, for up to two years.
          </li>
        </ul>
        <p>
          <strong>Analytics.</strong> Our website pages include the Google tag (Google Analytics 4, provided by Google). It runs in Google&apos;s Consent Mode: until you accept, analytics and
          advertising storage are off and no analytics cookies are set, although Google may still receive basic, cookieless signals about the page view (such as the page, time, browser type
          and an approximate location derived from your IP address) that it doesn&apos;t link to you with cookies. If you accept, Google Analytics also receives usage information such as pages
          viewed, referrer, device and browser details, linked by its cookies. We use this only to understand and improve the website. We don&apos;t use Google advertising products or Google
          Signals, and we never send your account details, email address or preview content to Google Analytics. Google processes this data under its own terms and privacy policy, and it may
          be processed outside your country.
        </p>
        <p>
          <strong>Your choice.</strong> The banner asks before any analytics cookies are set, and you can change your mind at any time with <em>Cookie settings</em> at the bottom of every page.
          Declining doesn&apos;t affect how Localians works. You can also block or delete cookies in your browser, but blocking our own cookies means you won&apos;t be able to stay signed in.
          Applications you share through Localians may set their own cookies; those are governed by that app&apos;s own policies.
        </p>
      </>
    ),
  },
  {
    id: "service-providers",
    title: "Third-party service providers",
    body: (
      <>
        <p>We share limited information with providers we need to run Localians. They may process it only to provide their service to us.</p>
        <ul>
          <li><strong>Hosting and infrastructure:</strong> Localians runs on a virtual private server from Hostinger, which hosts our web app, gateway and database. Your account data, preview metadata and preview traffic in transit are processed on that infrastructure.</li>
          <li><strong>Email delivery:</strong> Resend sends our service emails (verification, password reset, order and security messages), so it receives your email address, name and the content of those messages. Support mail you send to <MailLink /> is handled by our email provider for that mailbox.</li>
          <li><strong>Website analytics:</strong> Google provides Google Analytics on our website pages, as described in Cookies and similar technologies. With your consent it receives usage information linked by its cookies; without it, only cookieless signals.</li>
          <li><strong>Sign-in:</strong> if you choose GitHub sign-in, GitHub provides us with your profile details under its own privacy terms.</li>
          <li><strong>Blockchain data:</strong> to verify a payment, our server queries a public BNB Smart Chain node. That query contains the transaction hash and wallet addresses, which are already public on the blockchain. See below.</li>
        </ul>
        <p>
          We also use standard open-source libraries. We don&apos;t disclose personal information to others except to these providers, where you ask us to, where the law requires, or to protect the service and its
          users (for example against abuse). If our business were ever transferred, we would tell you how this affects your information.
        </p>
      </>
    ),
  },
  {
    id: "payments-and-blockchain",
    title: "Payments and blockchain",
    body: (
      <>
        <p>
          {payments
            ? "The Preview Pass is paid in USDT on BNB Smart Chain (BEP20) and reviewed by a person."
            : "Paid upgrades are not open yet. When they open, the Preview Pass is planned to be paid in USDT on BNB Smart Chain (BEP20) and reviewed by a person."}{" "}
          You create an upgrade request in your dashboard, which gives you an Order ID; you send the payment
          and give us the transaction hash (or email it to us). We then check on the blockchain that the transfer exists and matches, and an administrator approves or rejects the request. We store the order,
          the transaction hash, the result of the check, the reviewer and any note, so we can activate, support and, where appropriate, revoke or correct a pass.
        </p>
        <ul>
          <li><strong>Blockchain transactions are public and permanent.</strong> Anyone can see a transaction and its wallet addresses on a public explorer. We can&apos;t delete or alter them, and a transfer can&apos;t be reversed by us or by the network. Cryptocurrency payments aren&apos;t anonymous, and we don&apos;t describe them that way.</li>
          <li><strong>Evidence you send us.</strong> You may email a screenshot or other proof of payment. These can show wallet balances, other transactions, account names or other personal details. Crop or hide anything unrelated before sending. Don&apos;t send seed phrases, private keys or passwords. We will never ask for them.</li>
          <li><strong>No payment-card data.</strong> We don&apos;t collect card or bank details.</li>
        </ul>
        <p>
          Payments and pass availability are rolled out in stages; see the <LegalLink href={routes.terms}>Terms of Service</LegalLink> for current availability and the conditions that apply. Refunds are handled case by case as described there.
        </p>
      </>
    ),
  },
  {
    id: "retention-and-deletion",
    title: "Data retention and deletion",
    body: (
      <>
        <p>
          We keep information for as long as it is needed to run the service, support you, prevent abuse and keep accurate financial and security records. We have not set fixed retention periods for most
          data, and we don&apos;t promise automatic deletion that isn&apos;t in place. What happens today:
        </p>
        <ul>
          <li><strong>Account and project data</strong> stays until your account is deleted. You can remove your own sessions and revoke CLI computers yourself in Settings.</li>
          <li><strong>Sessions</strong> expire after 30 days of inactivity or when you sign out. <strong>Short-lived records</strong>, such as expired device-approval codes, expired share-setup codes and rate-limit counters, are cleaned up automatically.</li>
          <li><strong>Preview metadata</strong> (sessions, connection events and traffic counts) is kept with your project so your dashboard history stays available.</li>
          <li><strong>Payment and order records</strong> and the <strong>activity trail</strong> of administrative actions are kept so that payments, passes and disputes can be traced.</li>
          <li><strong>Server logs</strong> are kept on our servers under the host&apos;s ordinary log handling and are used for troubleshooting and security.</li>
        </ul>
        <p>
          <strong>Deleting your account.</strong> Email <MailLink /> from the address on your account. When we delete an account we sign you out everywhere, revoke CLI access, stop and archive your previews, remove your sign-in
          methods (password hash and linked GitHub account), and replace your name, email address, username and picture with placeholders. We keep the anonymised account record and the order, payment and activity records that refer to it,
          because we may need them for accounting, fraud prevention, security and legal reasons. We won&apos;t re-identify you from them.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <>
        <p>We take reasonable steps to protect information, including:</p>
        <ul>
          <li>HTTPS for the website, dashboard and preview links, and an encrypted tunnel between the CLI and our gateway;</li>
          <li>hashed passwords, hashed CLI and one-time tokens and hashed preview passwords, and encryption of stored OAuth tokens;</li>
          <li>host-only, HTTP-only session cookies, CSRF protection, email verification and rate limiting on sign-in and password flows;</li>
          <li>limiting administrator access to a small number of accounts, with a separate admin sign-in and an activity trail.</li>
        </ul>
        <p>
          No online service is completely secure, and we can&apos;t guarantee that information will never be accessed without authorization. Please use a strong, unique password, and tell us right away at <MailLink /> if you suspect your account has been accessed by someone else.
        </p>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Your rights and choices",
    body: (
      <>
        <p>
          You can view and edit your name, username and profile picture in your dashboard settings, manage your sessions and CLI computers, and change your password. To ask for a copy of the personal information we hold about you,
          to correct it, or to have it deleted, email <MailLink /> from the address on your account. We may ask you to confirm it&apos;s you, and we&apos;ll reply as soon as we reasonably can.
        </p>
        <p>
          Depending on where you live, you may have additional rights, for example under the EU or UK GDPR or US state privacy laws: to object to or restrict certain processing, to data portability, or to complain to your local data protection authority.
          We will honour those rights where they apply to us. We don&apos;t claim any particular certification or compliance status beyond that. Some information can&apos;t be deleted or changed, such as public blockchain records and records we must keep by law.
        </p>
      </>
    ),
  },
  {
    id: "international-processing",
    title: "International data processing",
    body: (
      <>
        <p>
          Localians is available to developers worldwide. Your information is processed on our hosting provider&apos;s servers and by the providers listed above, which may be located in countries other than yours,
          including countries whose data protection laws differ from those where you live. Preview traffic can also pass through networks in other countries on its way to and from visitors.
        </p>
        <p>
          We take reasonable steps to protect information wherever it is processed, including choosing established providers that publish their own data protection terms. We don&apos;t claim any specific transfer mechanism or certification. Ask us at <MailLink /> if you want to know more.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        Localians is a developer tool and isn&apos;t directed to children. You must be at least 18 years old to create an account. If you believe a child has given us personal information, email <MailLink /> and we will delete it.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        We may update this policy as Localians changes. The date at the top shows when it last took effect. If we make a material change, we&apos;ll tell you in the dashboard or by email before it applies, where that is practical. Continuing to use Localians after the change means you accept the updated policy.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Questions about this policy or your information? Email <MailLink />, or see our <LegalLink href={routes.contact}>contact page</LegalLink>.
      </p>
    ),
  },
  ];
}

/** Static, refreshed when an admin changes the payment setting (revalidatePath) and at least every 5 minutes. */
export const revalidate = 300;

export default async function PrivacyPolicyPage() {
  const { payments } = await launchFlags();
  return (
    <SubPage
      eyebrow="Legal"
      title="Privacy Policy"
      intro={
        <>
          How Localians collects, uses and protects information when you share your localhost.
          <LegalMeta date="October 24, 2026" />
        </>
      }
      width="wide"
    >
      <LegalDocument sections={buildSections(payments)} />
      <JsonLd data={breadcrumbs([{ name: "Privacy Policy", path: routes.privacy }])} />
    </SubPage>
  );
}
