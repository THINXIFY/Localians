import type { Metadata } from "next";
import { GuideCta, GuideFaq, GuideLink, type FaqItem } from "@/components/sections/Guide";
import { CodeLine, Prose, SubPage } from "@/components/sections/SubPage";
import { pageMetadata } from "@/lib/seo";
import { routes } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "How to Share Localhost Online Securely",
  description:
    "Expose a local dev server to the internet with one command: a secure HTTPS link to your localhost, optionally password protected, with no router or firewall changes.",
  path: routes.shareLocalhost,
});

const faq: FaqItem[] = [
  {
    question: "Is it safe to expose localhost to the internet?",
    answer:
      "Only the one port you choose is reachable, and only while the share command runs. Visitors get an HTTPS link; nothing else on your computer or network is exposed. For anything sensitive, turn on password protection and stop sharing when you're done.",
  },
  {
    question: "Do the people I share with need an account?",
    answer: "No. They open the link in any browser. If the preview is password protected, they enter the password you gave them.",
  },
  {
    question: "Does my computer have to stay on?",
    answer:
      "Yes. Localians forwards visitors to the app running on your machine; it doesn't host a copy. If your computer sleeps or the dev server stops, visitors see that the preview is offline.",
  },
  {
    question: "Do I need to change my router, firewall or DNS?",
    answer: "No. The CLI makes an outgoing, encrypted connection to Localians, so it works behind home routers, office firewalls and NAT without opening ports.",
  },
  {
    question: "Can I choose the link's name?",
    answer: "Each share gets a random, hard-to-guess address on preview.localians.com. A reserved custom URL that stays the same every time you share comes with the Preview Pass.",
  },
];

export default function ShareLocalhostPage() {
  return (
    <SubPage
      eyebrow="Guide"
      title="Share localhost online, securely"
      intro="Need someone to see the app running on your computer — a client, a teammate, your phone? Localians gives your local dev server a secure HTTPS link with one command. No deploy, no port forwarding."
      back={{ href: "/", label: "Home" }}
    >
      <Prose>
        <h2>Share your local app in three steps</h2>
        <ol>
          <li>
            <strong>Start your app</strong> as usual — for example <code className="font-mono">npm run dev</code> — and note the port it prints.
          </li>
          <li>
            <strong>Run one command</strong> with that port:
          </li>
        </ol>
        <CodeLine>npx localians share 3000</CodeLine>
        <ol start={3}>
          <li>
            <strong>Approve this computer once.</strong> The first time, your browser opens so you can connect the CLI to your Localians account. Then the
            command prints your link, like <code className="font-mono">https://k3v9qz2mx7ta.preview.localians.com</code>.
          </li>
        </ol>
        <p>
          Send the link. Whoever opens it sees your app, live: your edits show up as you make them, with hot reload over WebSockets (Next.js needs{" "}
          <GuideLink href={routes.shareNextjs}>one setting</GuideLink>).
        </p>

        <h2>Keep previews private</h2>
        <ul>
          <li>
            <strong>Password protection.</strong> Turn it on for a project and visitors enter a password before they reach your app. Changing the password
            signs everyone out immediately.
          </li>
          <li>
            <strong>Unguessable links.</strong> Every share gets a new random address, so old links stop working.
          </li>
          <li>
            <strong>Stop any time.</strong> Press Ctrl+C in the terminal, or stop the preview from the dashboard — the link stops right away.
          </li>
          <li>
            <strong>Don&apos;t share secrets.</strong> A preview is your development app; avoid real customer data and production credentials.
          </li>
        </ul>
        <p>
          Details: <GuideLink href={routes.security}>how preview security works</GuideLink>.
        </p>

        <h2>How localhost tunneling works</h2>
        <p>
          The Localians CLI opens an outgoing TLS connection from your computer to the Localians gateway. When someone opens your link, the gateway sends the
          request through that connection, and the CLI forwards it to <code className="font-mono">localhost</code> on the port you chose — never to any
          other address or port. Responses travel back the same way, including WebSockets.
        </p>
        <p>
          By default your app sees requests addressed to <code className="font-mono">localhost:&lt;port&gt;</code>, which keeps dev servers&apos; host checks
          happy. The original address is passed in the standard <code className="font-mono">X-Forwarded-Host</code> and{" "}
          <code className="font-mono">X-Forwarded-Proto</code> headers.
        </p>

        <h2>Works with your stack</h2>
        <p>Anything that serves HTTP on a local port can be shared. Framework-specific notes:</p>
        <ul>
          <li>
            <GuideLink href={routes.shareNextjs}>Sharing a Next.js app</GuideLink> — port 3000 and hot reload settings.
          </li>
          <li>
            <GuideLink href={routes.shareVite}>Sharing a Vite app</GuideLink> — React, Vue and Svelte on port 5173.
          </li>
          <li>
            <GuideLink href={routes.frameworks}>Angular, Django, Rails, Flask, Express and more</GuideLink>.
          </li>
        </ul>
        <p>
          The CLI runs on Windows, macOS and Linux with Node.js 20 or newer. Coming from another tool? See{" "}
          <GuideLink href={routes.ngrokAlternative}>Localians as an ngrok alternative</GuideLink>.
        </p>
      </Prose>

      <GuideFaq items={faq} />
      <GuideCta name="Share localhost online" path={routes.shareLocalhost} />
    </SubPage>
  );
}
