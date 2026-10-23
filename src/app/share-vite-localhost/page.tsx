import type { Metadata } from "next";
import { GuideCta, GuideFaq, GuideLink, type FaqItem } from "@/components/sections/Guide";
import { CodeLine, Prose, SubPage } from "@/components/sections/SubPage";
import { pageMetadata } from "@/lib/seo";
import { routes } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Share a Vite App from Localhost (React, Vue, Svelte)",
  description:
    "Share your Vite dev server on localhost:5173 with an HTTPS preview link, hot reload included. When you need server.allowedHosts, and how to demo a production build.",
  path: routes.shareVite,
});

const faq: FaqItem[] = [
  {
    question: "Do I need to change vite.config?",
    answer:
      "No, not by default. Localians sends requests to Vite as localhost:5173, which Vite always allows. You only add the preview domain to server.allowedHosts if you share with --host-header preserve.",
  },
  {
    question: "Does hot module replacement work for viewers?",
    answer: "Yes. Vite's HMR connection is a WebSocket, and Localians forwards WebSockets, so viewers see your edits as you save.",
  },
  {
    question: "Vite started on 5174 instead of 5173. Which port do I share?",
    answer: "Always the port Vite prints. It moves to the next free port when 5173 is busy, for example because another project is running.",
  },
  {
    question: "Can I share a production build?",
    answer: "Yes. Run vite build and vite preview, then share the port vite preview prints (4173 by default). It loads faster for clients than the dev server.",
  },
];

export default function ShareVitePage() {
  return (
    <SubPage
      eyebrow="Guide · Vite"
      title="Share a Vite app from localhost"
      intro="React, Vue or Svelte on Vite: give the dev server running on your machine an HTTPS link that anyone can open, with hot reload still working. No configuration needed in most projects."
      back={{ href: routes.shareLocalhost, label: "Share localhost" }}
    >
      <Prose>
        <h2>1. Start Vite</h2>
        <CodeLine>npm run dev</CodeLine>
        <p>Vite listens on port 5173, or the next free port if that one is busy. Use the port it prints.</p>

        <h2>2. Share the port</h2>
        <CodeLine>npx localians share 5173</CodeLine>
        <p>
          Approve this computer in your browser the first time; after that the command prints your HTTPS preview link straight away. Keep it running while
          you share and press Ctrl+C to stop.
        </p>

        <h2>Why it works without changes</h2>
        <ul>
          <li>
            <strong>Host checks:</strong> Vite only answers requests for hosts it trusts. Localians forwards requests as{" "}
            <code className="font-mono">localhost:5173</code>, which Vite always trusts.
          </li>
          <li>
            <strong>Hot reload:</strong> Vite&apos;s HMR runs over a WebSocket, and preview links carry WebSockets, so edits reach your viewers live.
          </li>
        </ul>

        <h2>When you need server.allowedHosts</h2>
        <p>
          If your app needs to see the public address — for example it builds absolute links from the request — share with{" "}
          <code className="font-mono">--host-header preserve</code> and allow Localians preview domains in <code className="font-mono">vite.config</code>:
        </p>
        <CodeLine>{`server: { allowedHosts: [".preview.localians.com"] }`}</CodeLine>
        <p>A leading dot allows every preview subdomain.</p>

        <h2>Demo a production build</h2>
        <p>For a client walkthrough, a production build is faster and closer to what you&apos;ll ship:</p>
        <CodeLine>{"npm run build\nnpx vite preview\nnpx localians share 4173"}</CodeLine>
        <p>
          Protect client work with a password (<GuideLink href={routes.security}>how it works</GuideLink>). Using Next.js instead? See{" "}
          <GuideLink href={routes.shareNextjs}>sharing a Next.js app</GuideLink>.
        </p>
      </Prose>

      <GuideFaq items={faq} />
      <GuideCta name="Share a Vite app" path={routes.shareVite} />
    </SubPage>
  );
}
