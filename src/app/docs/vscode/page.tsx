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
  description: "Install the Localians VS Code extension, connect your account, share a running app, set a password, choose how long the link works, and fix common problems.",
  path: routes.vscodeDocs,
});

const commands: [string, string][] = [
  ["Localians: Share App", "Pick a running app and share it (also the status bar entry)"],
  ["Localians: Stop Sharing", "Stop a preview; its link stops working immediately"],
  ["Localians: Copy Preview Link / Open Preview", "For the current preview"],
  ["Localians: Set Preview Password", "Protect a preview, or change its password"],
  ["Localians: Open Dashboard", "Projects, analytics and every preview, in the browser"],
  ["Localians: Connect to Localians / Sign Out / Switch Account", "Account"],
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
          Open the Localians view in the activity bar and click <strong>Connect to Localians</strong>. Your browser opens once so you can approve VS Code; the extension then stores a revocable token in
          VS Code&apos;s encrypted Secret Storage (never in settings, workspace files or logs). Revoke it any time in <strong>Settings → CLI</strong> on the dashboard; signing out revokes it too.
        </p>

        <h2>Share an app</h2>
        <ol>
          <li>Start your app as usual (<code className="font-mono">npm run dev</code>, <code className="font-mono">python manage.py runserver</code>, …).</li>
          <li>Click it under <strong>Local apps</strong>, or run <strong>Localians: Share App</strong>. Apps are found on common development ports, plus the ports your workspace&apos;s frameworks use.</li>
          <li>Pick a project (the one that already uses that port is suggested, or create one named after your app).</li>
          <li>Choose who can open it: <strong>Public</strong> or <strong>Password protected</strong>.</li>
          <li>Choose how long the link works. The default is until the project&apos;s free 24-hour preview or its Preview Pass ends; you can stop sooner (5 minutes to 24 hours).</li>
        </ol>
        <p>
          The link is copied to your clipboard once Localians confirms the tunnel is serving. Your previews stay listed in the sidebar with their status; copy, open, stop, add a password or share again from there, the status bar or
          the Command Palette. Closing the VS Code window stops the previews it started.
        </p>

        <h2>Free preview, Preview Pass and custom URLs</h2>
        <p>
          Plans work exactly as in the dashboard and the CLI, and Localians decides: each project has one free 24-hour preview window; if it is over, the extension tells you and links to the project&apos;s plan page, where a Preview Pass adds
          more days and a custom URL for that project. With a pass, shares use the project&apos;s custom URL automatically when it has one and custom URLs are enabled. See <Link href="/#pricing" className="text-fg underline underline-offset-4">plans and pricing</Link>.
        </p>

        <h2>Password protection</h2>
        <p>
          <strong>Localians: Set Preview Password</strong> turns on protection or changes the password (at least 8 characters, stored hashed, never logged). Visitors enter it before they reach your app. Making a protected project public
          again is done in the dashboard, so a stolen token can&apos;t expose it.
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
          <li><strong>&ldquo;Nothing is answering on localhost:&lt;port&gt;&rdquo;</strong>: start your dev server first and check that the port opens in your browser. Use <strong>Enter a port…</strong> if it isn&apos;t listed.</li>
          <li><strong>Sharing is turned off in Restricted Mode</strong>: trust the workspace (Manage Workspace Trust) to share its apps.</li>
          <li><strong>&ldquo;Your sign-in expired or was revoked&rdquo;</strong>: click Connect Again. Revoking the computer in the dashboard ends its previews.</li>
          <li><strong>The free preview is over</strong>: open the plan page from the notification, or choose another project.</li>
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
