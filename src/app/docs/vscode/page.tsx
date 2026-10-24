import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { Prose, SubPage } from "@/components/sections/SubPage";
import { VsixDownload, VsixInstallSteps } from "@/components/vscode/VsixDownload";
import { breadcrumbs, pageMetadata } from "@/lib/seo";
import { routes } from "@/lib/site";
import { vscodeAvailability, vscodeExtension } from "@/lib/vscode-extension";

export const metadata: Metadata = pageMetadata({
  title: "VS Code Extension Guide: Share Localhost from Your Editor",
  description: "Install the Localians VS Code extension, sign in from its sidebar, share running apps, manage several previews, set a password, and fix common problems.",
  path: routes.vscodeDocs,
});

const commands: [string, string][] = [
  ["Localians: Open Localians", "Show the Localians sidebar (also the status bar entry)"],
  ["Localians: Sign In / Sign Out / Switch Account", "Your account"],
  ["Localians: Share App", "Share a running app step by step, without the sidebar"],
  ["Localians: Copy Preview Link / Open Preview", "For a running preview (you pick one when several are running)"],
  ["Localians: Stop Sharing", "Stop a preview; its link stops working immediately"],
  ["Localians: Set Preview Password", "Protect a preview, or change its password"],
  ["Localians: Open Dashboard", "Projects, analytics and every preview, in the browser"],
  ["Localians: Getting Started", "The four-step guide: sign in, run your app, share, copy the link"],
];

export default function VsCodeDocsPage() {
  const { installable, downloadable } = vscodeAvailability();
  return (
    <SubPage
      eyebrow="VS Code extension"
      title="Share localhost from VS Code"
      intro="Install the extension, connect your Localians account once, and share a running app with a secure HTTPS link without opening a terminal."
      back={{ href: routes.docs, label: "Documentation" }}
      notice={
        installable || downloadable ? undefined : (
          <>
            <strong className="font-medium text-fg">Coming soon:</strong> the extension hasn&apos;t been released yet, so there is nothing to install today. Until then, share from any terminal with{" "}
            <code className="font-mono">npx localians share 3000</code> (see the <Link href={routes.cliGuide} className="text-fg underline underline-offset-4">CLI guide</Link>). The steps below describe how it works once released.
          </>
        )
      }
    >
      <Prose>
        <h2 id="install">Install</h2>
        <p>
          <strong>From the Marketplace:</strong>{" "}
          {installable ? "search for Localians in the Extensions view (publisher THINXIFY), or use the Install from Marketplace button on the extension page." : "coming soon. It will be available by searching for Localians in the Extensions view (publisher THINXIFY), with automatic updates."}
        </p>
        <p>
          <strong>From a .vsix file:</strong> the file, its version, supported VS Code versions and checksum are below, and on the{" "}
          <Link href={routes.vscodeExtension + "#download"} className="text-fg underline underline-offset-4">
            extension page
          </Link>
          .
        </p>
      </Prose>
      <div className="my-8">
        <VsixDownload />
      </div>
      <Prose>
        <h3 className="text-[18px] font-semibold text-fg">Install from VSIX</h3>
      </Prose>
      <div className="mt-4 mb-8">
        <VsixInstallSteps />
      </div>
      <Prose>
        <p>
          It needs VS Code {vscodeExtension.minVscode} or newer and a free Localians account. Nothing else: the extension includes the same tunnel client as the CLI.
        </p>

        <h2>Connect</h2>
        <p>
          Click <strong>Localians</strong> in the activity bar (or <strong>Localians: Signed Out</strong> in the status bar) and then <strong>Sign In to Localians</strong>. Your browser opens the
          approval page and the sidebar shows <strong>Waiting for sign in…</strong> with a one-time code (and <strong>Copy Code</strong> and <strong>Open Browser Again</strong>). Check that the browser
          shows the same code and approve it; the sidebar updates by itself. Nothing to copy or paste.
        </p>
        <p>
          The extension keeps a revocable token in VS Code&apos;s encrypted Secret Storage (never in settings, workspace files, the sidebar or logs). The sidebar shows your username, with
          <strong> Switch Account</strong> and <strong>Sign Out</strong>. Revoke a computer any time in <strong>Settings → CLI</strong> on the dashboard; signing out revokes it too.
        </p>

        <h2>Share an app</h2>
        <ol>
          <li>Start your app as usual (<code className="font-mono">npm run dev</code>, <code className="font-mono">python manage.py runserver</code>, …).</li>
          <li>
            Under <strong>Your Local App</strong>, pick it in <strong>Running app</strong>. Localians checks this computer&apos;s localhost only, on common ports (3000 Next.js, 5173 Vite,
            4200 Angular, 8000 Django, …) and the ports your workspace&apos;s frameworks use. Not listed? Choose <strong>Enter a port…</strong> or <strong>Retry Detection</strong>.
          </li>
          <li>Check the <strong>Project</strong>: the one you used for this app before, or the one that uses its port, is selected; otherwise <strong>Create new project…</strong> is suggested, named after your app.</li>
          <li>
            Optional: open <strong>Options</strong> to choose <strong>Public</strong> or <strong>Password protected</strong> (you type the password in VS Code&apos;s own masked box), and how long the link
            works. The default is until the project&apos;s free 24-hour preview or Preview Pass ends; longer lengths are only offered with a pass.
          </li>
          <li>Click <strong>Share App</strong>.</li>
        </ol>
        <p>
          The preview appears under <strong>Active Previews</strong> once Localians confirms the tunnel is serving, and its link is copied for you. Each preview shows its project, port, status,
          time left and link, with <strong>Copy Link</strong>, <strong>Open</strong> and <strong>Stop</strong>. Closing the VS Code window stops the previews it started.
        </p>

        <h2>Several apps at once</h2>
        <p>
          Click <strong>Share Another App</strong> and share the next one the same way. Every preview has its own project, port, link, timer and access, and stopping one leaves the others running.
          Previews started from a terminal (<code className="font-mono">npx localians share</code>) are listed too. An app that is already being shared can&apos;t be shared twice, and your account&apos;s
          limit on previews running at the same time (5 by default) applies everywhere. The status bar shows how many are live, for example <strong>Localians: 2 Live</strong>.
        </p>

        <h2>Free preview, Preview Pass and custom URLs</h2>
        <p>
          Plans work exactly as in the dashboard and the CLI, and Localians decides. Under the project, the sidebar shows its plan (free preview available or running, or Preview Pass until a date).
          When the free preview is over, <strong>Share App</strong> becomes <strong>Renew Preview Pass</strong>, which opens that project&apos;s plan page; a pass adds more days and a custom URL for
          that project. A project&apos;s reserved custom URL is shown under <strong>Options</strong> and used automatically when custom URLs are enabled. See{" "}
          <Link href="/#pricing" className="text-fg underline underline-offset-4">plans and pricing</Link>.
        </p>

        <h2>Password protection</h2>
        <p>
          Choose <strong>Password protected</strong> under <strong>Options</strong> before sharing, or run <strong>Localians: Set Preview Password</strong> for a running preview, to turn on protection or
          change the password (at least 8 characters, stored hashed, never logged). Visitors enter it before they reach your app. Making a protected project public again is done in the dashboard, so
          a stolen token can&apos;t expose it.
        </p>

        <h2>Stop sharing and sign out</h2>
        <p>
          Click <strong>Stop</strong> on a preview: its link stops working right away. <strong>Sign Out</strong> (in the sidebar, or <strong>Localians: Sign Out</strong>) stops the previews this window
          started, revokes this computer&apos;s access and forgets the token; it asks first when something is live.
        </p>

        <h2>Commands</h2>
        <ul>
          {commands.map(([name, text]) => (
            <li key={name}>
              <strong>{name}</strong>: {text}
            </li>
          ))}
        </ul>

        <h2>Settings</h2>
        <ul>
          <li><code className="font-mono">localians.extraPorts</code>: more local ports to look for apps on.</li>
          <li><code className="font-mono">localians.hostHeader</code>: <code className="font-mono">rewrite</code> (default) sends <code className="font-mono">Host: localhost:&lt;port&gt;</code>; <code className="font-mono">preserve</code> forwards the public host.</li>
          <li><code className="font-mono">localians.verboseLog</code>: log each forwarded request (method, path, status) to Output → Localians.</li>
          <li><code className="font-mono">localians.serverUrl</code>: only for a self-hosted Localians; HTTPS is required.</li>
        </ul>

        <h2>Troubleshooting</h2>
        <ul>
          <li><strong>&ldquo;No running local application found&rdquo;</strong> or <strong>&ldquo;Nothing is running on localhost:&lt;port&gt;&rdquo;</strong>: start your dev server first and check that the port opens in your browser, then <strong>Retry Detection</strong>, or <strong>Enter Port Manually</strong>.</li>
          <li><strong>&ldquo;This app is already being shared&rdquo;</strong>: its preview is under Active Previews; copy or stop it there.</li>
          <li><strong>&ldquo;You&apos;ve reached your active preview limit&rdquo;</strong>: stop another preview (here, in a terminal, or in the dashboard), or review your plan.</li>
          <li><strong>&ldquo;Connection interrupted. Reconnecting…&rdquo;</strong>: your network or computer paused; the link comes back by itself while VS Code and your app keep running.</li>
          <li><strong>Sharing is turned off in Restricted Mode</strong>: trust the workspace (Manage Workspace Trust) to share its apps.</li>
          <li><strong>&ldquo;Your sign-in expired or was revoked&rdquo;</strong>: click Sign In. Revoking the computer in the dashboard ends its previews.</li>
          <li><strong>&ldquo;Your preview period has ended&rdquo;</strong>: click <strong>Renew Preview Pass</strong>, or choose another project.</li>
          <li>Anything else: <strong>Localians: Show Log</strong> shows what the extension did (tokens and passwords are never written to it); see <Link href={routes.troubleshooting} className="text-fg underline underline-offset-4">Troubleshooting</Link>.</li>
        </ul>

        <p>
          <Link href={routes.vscodeExtension} className="text-fg underline underline-offset-4">Back to the VS Code extension page</Link>
        </p>
      </Prose>
      <JsonLd data={breadcrumbs([{ name: "Documentation", path: routes.docs }, { name: "VS Code Extension", path: routes.vscodeDocs }])} />
    </SubPage>
  );
}
