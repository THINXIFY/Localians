import type { Metadata } from "next";
import { GuideCta, GuideFaq, GuideLink, type FaqItem } from "@/components/sections/Guide";
import { CodeLine, Prose, SubPage } from "@/components/sections/SubPage";
import { pageMetadata } from "@/lib/seo";
import { routes } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Share a Next.js App from Localhost",
  description:
    "Share your Next.js dev server on localhost:3000 with an HTTPS preview link: one command, the allowedDevOrigins setting for hot reload, and tips for client demos.",
  path: routes.shareNextjs,
});

const faq: FaqItem[] = [
  {
    question: "Why does the page load but not update live?",
    answer:
      "Next.js blocks its development endpoints for origins it doesn't know, which stops hot reload for visitors. Add *.preview.localians.com to allowedDevOrigins in next.config and restart next dev.",
  },
  {
    question: "Does it work with the App Router, API routes and middleware?",
    answer:
      "Yes. Visitors' requests reach your dev server like any other browser request, so pages, route handlers, middleware and WebSockets behave as they do on localhost.",
  },
  {
    question: "My sign-in redirects back to localhost. What do I change?",
    answer:
      "Auth libraries build callback URLs from their configured base URL. While you share, set it to your preview link (and add that link to your OAuth app's allowed redirect URLs), or test sign-in locally.",
  },
  {
    question: "Should I share next dev or a production build?",
    answer:
      "next dev is best for collaborating on changes. For a client demo, next build && next start is faster and closer to what you'll ship; share port 3000 the same way.",
  },
];

export default function ShareNextjsPage() {
  return (
    <SubPage
      eyebrow="Guide · Next.js"
      title="Share a Next.js app from localhost"
      intro="Show a Next.js app that's running on your machine to a client or teammate, without deploying a preview. It takes one command — plus one setting if you want hot reload for your viewers."
      back={{ href: routes.shareLocalhost, label: "Share localhost" }}
    >
      <Prose>
        <h2>1. Start Next.js</h2>
        <p>
          Run the dev server as usual. It listens on port 3000 unless that port is busy — use the port it prints.
        </p>
        <CodeLine>npm run dev</CodeLine>

        <h2>2. Share port 3000</h2>
        <p>In a second terminal, in the same project folder:</p>
        <CodeLine>npx localians share 3000</CodeLine>
        <p>
          The first time, your browser opens once so you can approve this computer. The command then prints an HTTPS link on{" "}
          <code className="font-mono">preview.localians.com</code>. Keep the command running while you share; press Ctrl+C to stop.
        </p>

        <h2>3. Allow hot reload for your preview link</h2>
        <p>
          Next.js only serves its development resources (like the hot reload connection) to origins you allow. Add the Localians preview domain to{" "}
          <code className="font-mono">next.config.ts</code>, then restart <code className="font-mono">next dev</code>:
        </p>
        <CodeLine>{`allowedDevOrigins: ["*.preview.localians.com"]`}</CodeLine>
        <p>Pages load without it, but your viewers won&apos;t see edits until they reload.</p>

        <h2>What your app sees</h2>
        <ul>
          <li>
            Requests arrive with <code className="font-mono">Host: localhost:3000</code>, so nothing in your app needs to know about the preview.
          </li>
          <li>
            The preview&apos;s real address is in <code className="font-mono">X-Forwarded-Host</code> and <code className="font-mono">X-Forwarded-Proto</code>{" "}
            (https), for code that builds absolute URLs.
          </li>
          <li>
            If your app must see the public host itself, run <code className="font-mono">npx localians share 3000 --host-header preserve</code>.
          </li>
        </ul>

        <h2>Before you send the link</h2>
        <ul>
          <li>
            <strong>Protect client work</strong> with a password: visitors enter it before they see anything. See{" "}
            <GuideLink href={routes.security}>preview security</GuideLink>.
          </li>
          <li>
            <strong>Use test data.</strong> A preview runs your development app with your local environment variables.
          </li>
          <li>
            <strong>Several apps?</strong> Share each port separately, for example a Next.js front end on 3000 and an API on 4000.
          </li>
        </ul>
        <p>
          Other frameworks: <GuideLink href={routes.shareVite}>Vite</GuideLink> and <GuideLink href={routes.frameworks}>more framework guides</GuideLink>.
        </p>
      </Prose>

      <GuideFaq items={faq} />
      <GuideCta name="Share a Next.js app" path={routes.shareNextjs} />
    </SubPage>
  );
}
