import type { Metadata } from "next";
import Link from "next/link";
import { CodeLine, Prose, SubPage } from "@/components/sections/SubPage";
import { routes } from "@/lib/site";
import { pageMetadata, breadcrumbs } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";

export const metadata: Metadata = pageMetadata({
  title: "CLI Guide: localians share, login, status and logout",
  description: "Reference for the Localians CLI: share a local port over HTTPS, choose the project, protect it, check status and stop sharing. Windows, macOS and Linux.",
  path: routes.cliGuide,
});

export default function CliGuidePage() {
  return (
    <SubPage
      eyebrow="CLI guide"
      title="The Localians CLI"
      intro="One command turns a local port into a preview link. Everything else is optional."
      back={{ href: routes.docs, label: "Documentation" }}
      notice={
        <>
          <strong className="font-medium text-fg">Beta:</strong> Localians is in beta. The <code className="font-mono">localians</code> package is on npm, so there
          is nothing to install: <code className="font-mono">npx npx localians share 3000</code> works on Windows PowerShell, macOS and Linux.
        </>
      }
    >
      <Prose>
        <h2>Install</h2>
        <p>
          You need Node.js 20 or newer. Run the CLI straight from npm, with nothing to install:
        </p>
        <CodeLine>npx npx localians share 3000</CodeLine>
        <p>
          Or install it once and use the shorter <code className="font-mono">localians</code> command everywhere below:
        </p>
        <CodeLine>npm install -g localians</CodeLine>
        <p>
          The CLI talks to localians.com by default, so no flags are needed. Remove a global install with{" "}
          <code className="font-mono">npm uninstall -g localians</code>. Contributors running their own Localians server can build the CLI from the
          repository and point it at that server with <code className="font-mono">--api-url &lt;url&gt;</code>.
        </p>

        <h2>localians share &lt;port&gt;</h2>
        <p>Shares the app running on <code className="font-mono">localhost:&lt;port&gt;</code>. Run it in your project folder, in a second terminal next to your dev server.</p>
        <CodeLine>npx localians share 5173</CodeLine>
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
          <code className="font-mono">npx localians share 5173 --setup k7m2xq9p4tzw</code>. The one-time code carries the project and access (public or
          password) you chose there, so the CLI asks nothing. It works once, within 30 minutes, and only for your own login.
        </p>
        <p>
          <strong>Project selection:</strong> pass <code className="font-mono">--project &lt;name-or-id&gt;</code> to choose one explicitly. In scripts
          (no interactive terminal), add <code className="font-mono">--yes</code> to allow creating a project automatically.
        </p>
        <CodeLine>npx localians share 5173 --project client-dashboard</CodeLine>
        <p>
          <strong>Preview time:</strong> every project gets one free 24-hour preview window, starting with its first share; restarting or reconnecting
          stays within it. A 7-Day Preview Pass adds 7 more days for one project. By default a share runs until that window ends — add{" "}
          <code className="font-mono">--duration</code> to stop it sooner.
        </p>
        <CodeLine>npx localians share 5173 --duration 1h</CodeLine>
        <ul>
          <li>
            <strong>-d, --duration &lt;time&gt;</strong> — auto-stop after <code className="font-mono">5m</code>, <code className="font-mono">15m</code>,{" "}
            <code className="font-mono">30m</code>, <code className="font-mono">1h</code>, <code className="font-mono">12h</code> or{" "}
            <code className="font-mono">24h</code> (<code className="font-mono">3d</code> or <code className="font-mono">7d</code> with a pass).
          </li>
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
        <CodeLine>npx localians login</CodeLine>

        <h2>localians status</h2>
        <p>Shows who you&apos;re signed in as, and each preview being shared from this computer: project, local address, preview link, status and uptime.</p>
        <CodeLine>npx localians status</CodeLine>

        <h2>localians logout</h2>
        <p>Revokes this computer&apos;s access on the server and deletes it locally. Anything this computer is sharing stops.</p>
        <CodeLine>npx localians logout</CodeLine>

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
      <JsonLd data={breadcrumbs([{ name: "Documentation", path: routes.docs }, { name: "CLI Guide", path: routes.cliGuide }])} />
    </SubPage>
  );
}
