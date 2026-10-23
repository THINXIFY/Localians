import type { Metadata } from "next";
import Link from "next/link";
import { CodeLine, Prose, SubPage } from "@/components/sections/SubPage";
import { routes } from "@/lib/site";
import { pageMetadata, breadcrumbs } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";

export const metadata: Metadata = pageMetadata({
  title: "Getting Started: Share Your Localhost in a Minute",
  description: "Step by step: start your app, run npx localians share with its port, approve the login once, and send the HTTPS preview link.",
  path: routes.gettingStarted,
});

export default function GettingStartedPage() {
  return (
    <SubPage
      eyebrow="Getting started"
      title="Share your first localhost app in 60 seconds."
      intro="Localians gives the web app running on your computer a temporary HTTPS link you can send to a client or teammate. Nothing is deployed: visitors reach your app through your computer, for as long as you keep sharing."
      back={{ href: routes.docs, label: "Documentation" }}
      notice={
        <>
          <strong className="font-medium text-fg">Beta:</strong> the <code className="font-mono">localians</code> command isn&apos;t on npm yet, so{" "}
          <code className="font-mono">npx localians</code> doesn&apos;t work today. Install it once from a Localians checkout (below). Public preview
          links also need the Localians service to be deployed; until then, links work on the computer and network running the beta server.
        </>
      }
    >
      <Prose>
        <h2>What you need</h2>
        <ul>
          <li>A Localians account (sign up, then verify your email).</li>
          <li>Node.js 20 or newer.</li>
          <li>A web app you can run locally — anything that opens at <code className="font-mono">http://localhost:&lt;port&gt;</code>.</li>
        </ul>

        <h2>One-time setup (beta)</h2>
        <p>From a checkout of the Localians repository, build and link the CLI. This adds the <code className="font-mono">localians</code> command.</p>
        <CodeLine label="Windows PowerShell">{"npm install; npm run tunnel:build\ncd tunnel\\cli; npm link"}</CodeLine>
        <CodeLine label="macOS / Linux">{"npm install && npm run tunnel:build\ncd tunnel/cli && npm link"}</CodeLine>

        <h2>1. Start your app</h2>
        <p>Open your project and start its development server the way you always do, for example:</p>
        <CodeLine>npm run dev</CodeLine>
        <p>
          Note the port it prints. If you can open <code className="font-mono">http://localhost:5173</code> (or your port) in your browser, you&apos;re
          ready.
        </p>

        <h2>2. Share it</h2>
        <p>Open a second terminal in the same project folder and run the command with your port:</p>
        <CodeLine>localians share 5173</CodeLine>
        <p>The first time, two quick questions are answered for you:</p>
        <ul>
          <li>
            <strong>Sign in:</strong> your browser opens and asks you to approve this computer. Click <strong>Authorize CLI</strong>. This happens
            once per computer.
          </li>
          <li>
            <strong>Project:</strong> if none of your projects uses this port yet, the CLI asks before creating one named after your app (or lets you
            pick an existing one).
          </li>
        </ul>

        <h2>Optional: protect it with a password</h2>
        <p>
          In the dashboard, choose <strong>Password</strong> in Share App (or under <strong>Preview access</strong> on the project page). Visitors
          then see a password page before your app. Send the password separately from the link.
        </p>

        <h2>3. Send the link</h2>
        <p>
          The terminal prints your <strong>preview link</strong>, and the dashboard shows it too, with <strong>Copy Link</strong> and{" "}
          <strong>Open Preview</strong>. Send it to your client. Changes you make locally appear for them on reload (or instantly, with hot reload).
        </p>
        <p>
          Keep your app <em>and</em> the share command running — the link only works while both are on. Anyone who has the link can open the app,
          unless you add a password, so don&apos;t share apps with sensitive data (see <Link href={routes.security} className="text-fg underline underline-offset-4">Security</Link>).
        </p>

        <h2>4. Stop sharing</h2>
        <p>
          Press <strong>Ctrl+C</strong> in the terminal, or click <strong>Stop Sharing</strong> in the dashboard. The link stops working immediately;
          running the command again gives you a new link.
        </p>

        <h2>Prefer a guided version?</h2>
        <p>
          In the dashboard, <strong>Share App</strong> walks you through these steps, builds the exact command for your port, and shows your link the
          moment it connects. Stuck? See <Link href={routes.troubleshooting} className="text-fg underline underline-offset-4">Troubleshooting</Link>{" "}
          or the <Link href={routes.frameworks} className="text-fg underline underline-offset-4">framework guides</Link>.
        </p>
      </Prose>
      <JsonLd data={breadcrumbs([{ name: "Documentation", path: routes.docs }, { name: "Getting Started", path: routes.gettingStarted }])} />
    </SubPage>
  );
}
