import type { Metadata } from "next";
import Link from "next/link";
import { CodeLine, Prose, SubPage } from "@/components/sections/SubPage";
import { routes } from "@/lib/site";

export const metadata: Metadata = {
  title: "CLI Guide",
  description: "Reference for the Localians CLI: install, share, login, status and logout.",
  alternates: { canonical: routes.cliGuide },
};

export default function CliGuidePage() {
  return (
    <SubPage
      eyebrow="CLI guide"
      title="The Localians CLI"
      intro="One command turns a local port into a preview link. Everything else is optional."
      back={{ href: routes.docs, label: "Documentation" }}
      notice={
        <>
          <strong className="font-medium text-fg">Beta:</strong> the <code className="font-mono">localians</code> package isn&apos;t published to npm
          yet, so <code className="font-mono">npx localians</code> won&apos;t resolve until it is. Install it from a Localians checkout as shown below.
          The commands are the same in Windows PowerShell, macOS and Linux unless noted.
        </>
      }
    >
      <Prose>
        <h2>Install (beta)</h2>
        <p>From the Localians repository, with Node.js 20 or newer:</p>
        <CodeLine label="Windows PowerShell">{"npm install; npm run tunnel:build\ncd tunnel\\cli; npm link"}</CodeLine>
        <CodeLine label="macOS / Linux">{"npm install && npm run tunnel:build\ncd tunnel/cli && npm link"}</CodeLine>
        <p>
          The build remembers which Localians server it belongs to (<code className="font-mono">LOCALIANS_DEFAULT_API_URL</code>, or the
          checkout&apos;s own web app), so no flags are needed. To use another server, add <code className="font-mono">--api-url &lt;url&gt;</code>{" "}
          once; the CLI remembers it after you sign in. Remove the command with <code className="font-mono">npm unlink -g localians</code>.
        </p>

        <h2>localians share &lt;port&gt;</h2>
        <p>Shares the app running on <code className="font-mono">localhost:&lt;port&gt;</code>. Run it in your project folder, in a second terminal next to your dev server.</p>
        <CodeLine>localians share 5173</CodeLine>
        <ol>
          <li>Checks that something is running on that port on your computer.</li>
          <li>If this computer isn&apos;t signed in yet (or its login expired), opens your browser to approve it, then carries on.</li>
          <li>Picks the project that uses this port. If there isn&apos;t one, it asks: create a project named after your app, or use an existing one.</li>
          <li>Prints your preview link, the workspace and whether the link is public or password protected, and keeps it online until you stop.</li>
        </ol>
        <p>
          <strong>Port selection:</strong> use the port your dev server prints (Next.js usually 3000, Vite 5173, Angular 4200). Any port from 1 to
          65535 works. The CLI only ever forwards to your own computer (127.0.0.1 / ::1).
        </p>
        <p>
          <strong>From the dashboard:</strong> the Share App page builds a command like{" "}
          <code className="font-mono">localians share 5173 --setup k7m2xq9p4tzw</code>. The one-time code carries the project and access (public or
          password) you chose there, so the CLI asks nothing. It works once, within 30 minutes, and only for your own login.
        </p>
        <p>
          <strong>Project selection:</strong> pass <code className="font-mono">--project &lt;name-or-id&gt;</code> to choose one explicitly. In scripts
          (no interactive terminal), add <code className="font-mono">--yes</code> to allow creating a project automatically.
        </p>
        <CodeLine>localians share 5173 --project client-dashboard</CodeLine>
        <ul>
          <li>
            <strong>--host-header preserve</strong> — send the preview host to your app instead of <code className="font-mono">localhost:&lt;port&gt;</code>.
          </li>
          <li>
            <strong>-v, --verbose</strong> — print each request and WebSocket.
          </li>
          <li>
            <strong>--no-browser</strong> — print the sign-in link instead of opening a browser.
          </li>
        </ul>

        <h2>Stopping sharing</h2>
        <p>
          Press <strong>Ctrl+C</strong> in the terminal that&apos;s sharing, or click <strong>Stop Sharing</strong> in the dashboard. Either way the
          link stops working right away. A stopped link is never reused — sharing again gives you a new link.
        </p>

        <h2>localians login</h2>
        <p>
          Signs this computer in without sharing anything. <code className="font-mono">share</code> does this for you when needed, so you rarely need it.
          You approve the computer in your browser; the CLI gets its own access token (never your dashboard session), valid for 90 days and
          revocable any time in Settings → CLI. If you belong to more than one workspace, the approval page asks which one this computer may share into.
        </p>
        <CodeLine>localians login</CodeLine>

        <h2>localians status</h2>
        <p>Shows who you&apos;re signed in as, and each preview being shared from this computer: project, local address, preview link, status and uptime.</p>
        <CodeLine>localians status</CodeLine>

        <h2>localians logout</h2>
        <p>Revokes this computer&apos;s access on the server and deletes it locally. Anything this computer is sharing stops.</p>
        <CodeLine>localians logout</CodeLine>

        <h2>Managing previews in the dashboard</h2>
        <p>
          <strong>Live Previews</strong> lists everything you&apos;re sharing with Copy Link, Open Preview and Stop Sharing, and updates as previews
          connect, drop and reconnect. Request and bandwidth numbers count HTTP requests and WebSocket connections forwarded to your app, and body
          plus WebSocket data in both directions (headers and encryption overhead aren&apos;t counted).
        </p>

        <h2>Local development gateway certificates</h2>
        <p>
          When the Localians server itself runs on your machine (contributors and beta testers), its gateway uses certificates from a local
          development CA (<code className="font-mono">npm run tunnel:certs</code>). Trust that CA instead of clicking through warnings, and remove it
          when you finish. Production previews use publicly trusted certificates and need none of this.
        </p>
        <CodeLine label="CLI — Windows PowerShell">{'$env:NODE_EXTRA_CA_CERTS = "C:\\path\\to\\localians\\.localians-dev\\certs\\ca.crt"'}</CodeLine>
        <CodeLine label="CLI — macOS / Linux">export NODE_EXTRA_CA_CERTS=~/path/to/localians/.localians-dev/certs/ca.crt</CodeLine>
        <CodeLine label="Browsers — Windows PowerShell">{"Import-Certificate -FilePath .localians-dev\\certs\\ca.crt -CertStoreLocation Cert:\\CurrentUser\\Root"}</CodeLine>
        <CodeLine label="Browsers — macOS">sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain .localians-dev/certs/ca.crt</CodeLine>
        <CodeLine label="Browsers — Linux (system, then Chrome/Firefox)">
          {'sudo cp .localians-dev/certs/ca.crt /usr/local/share/ca-certificates/localians-dev.crt && sudo update-ca-certificates\ncertutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "Localians dev CA" -i .localians-dev/certs/ca.crt'}
        </CodeLine>

        <p>
          More help: <Link href={routes.frameworks} className="text-fg underline underline-offset-4">framework guides</Link>,{" "}
          <Link href={routes.troubleshooting} className="text-fg underline underline-offset-4">troubleshooting</Link> and{" "}
          <Link href={routes.security} className="text-fg underline underline-offset-4">security</Link>.
        </p>
      </Prose>
    </SubPage>
  );
}
