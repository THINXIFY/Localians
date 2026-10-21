import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CodeLine, Prose, SubPage } from "@/components/sections/SubPage";
import { routes } from "@/lib/site";

export const metadata: Metadata = {
  title: "Troubleshooting",
  description: "Fixes for common Localians problems: app not running, wrong port, login, offline previews, hot reload, certificates and more.",
  alternates: { canonical: routes.troubleshooting },
};

function Problem({ id, title, symptom, children }: { id: string; title: string; symptom?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-[var(--radius-card)] border border-line bg-card/60 p-5 sm:p-6">
      <h2 className="!mt-0 !text-[18px]">{title}</h2>
      {symptom ? (
        <p className="mt-2 text-[14px] text-fg-3">
          <span className="font-medium text-fg-2">You see:</span> {symptom}
        </p>
      ) : null}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export default function TroubleshootingPage() {
  return (
    <SubPage
      eyebrow="Connection Help"
      title="Troubleshooting"
      intro="Find what you're seeing, then follow the fix. Most problems come down to the app or the share command not running."
      back={{ href: routes.docs, label: "Documentation" }}
    >
      <Prose>
        <Problem id="app-not-running" title="Your local app isn't running" symptom={<>&ldquo;We couldn&apos;t find a website running on port 5173. Start your app and try again.&rdquo;</>}>
          <p>
            The CLI checks your own computer before sharing. Start your dev server (for example <code className="font-mono">npm run dev</code>), wait
            until it says it&apos;s ready, and check that <code className="font-mono">http://localhost:5173</code> opens in your browser. Then run the
            share command again.
          </p>
        </Problem>

        <Problem id="wrong-port" title="Wrong port" symptom="the same message, or the preview shows a different app than you expected">
          <p>
            Use the port your dev server prints, not the framework&apos;s usual one: it changes when the default is busy. Vite might print{" "}
            <code className="font-mono">Local: http://localhost:5174/</code> — then share 5174.
          </p>
          <CodeLine>localians share 5174</CodeLine>
        </Problem>

        <Problem id="login-expired" title="Login expired or revoked" symptom="“Your login on this computer expired or was revoked. Let’s sign in again.”">
          <p>
            CLI logins last 90 days and can be revoked in Settings → CLI. The share command starts a new sign-in automatically: approve it in your
            browser and sharing continues.
          </p>
        </Problem>

        <Problem id="authorization" title="Authorization not completed" symptom="“Waiting for you to approve it…” never finishes, or “The login request expired before it was approved.”">
          <ul>
            <li>Open the link the CLI printed, check that the code matches your terminal, and click <strong>Authorize CLI</strong>.</li>
            <li>Make sure you&apos;re signed in to the right Localians account in that browser.</li>
            <li>The request expires after 10 minutes. Run the command again for a fresh code.</li>
            <li>No browser opened? Copy the printed link into one yourself.</li>
          </ul>
        </Problem>

        <Problem id="link-not-opening" title="The preview link won't open">
          <ul>
            <li>
              <strong>&ldquo;This preview link isn&apos;t active&rdquo;</strong> — sharing stopped (Ctrl+C, Stop Sharing, logout or the 24-hour limit).
              Run the share command again; you&apos;ll get a new link.
            </li>
            <li>
              <strong>&ldquo;The app isn&apos;t running&rdquo;</strong> — the link works, but your dev server stopped or crashed. Restart it; the same
              link starts working again.
            </li>
            <li>
              <strong>The address can&apos;t be found</strong> — during the beta, links on the local test server (<code className="font-mono">*.preview.localhost</code>)
              only open on the computer running it. Public links need the Localians service to be deployed.
            </li>
          </ul>
        </Problem>

        <Problem id="password" title="Visitors see a password page" symptom="“This preview is password protected”, “That password isn’t right”, or “Too many attempts”">
          <ul>
            <li>The project is password protected. Send your client the password (separately from the link).</li>
            <li>Forgot it? Set a new one on the project page under Preview access. Everyone, including you, enters the new one.</li>
            <li>
              After several wrong tries, that visitor has to wait a few minutes. To make the preview public instead, choose{" "}
              <strong>Public</strong> in Preview access.
            </li>
          </ul>
        </Problem>

        <Problem id="setup-code" title="Setup code used or expired" symptom="“That setup code was already used” or “…expired. Copy a fresh command from the dashboard.”">
          <p>
            Commands copied from Share App include a one-time code that works once, within 30 minutes. Reload the Share App page and copy the new
            command — or run <code className="font-mono">localians share &lt;port&gt;</code> without <code className="font-mono">--setup</code>.
          </p>
        </Problem>

        <Problem id="starting" title="“This preview is starting”" symptom="a Localians page with HTTP 503">
          <p>
            The share command connected, but Localians couldn&apos;t yet confirm who may open the preview, so it stays closed rather than risk being
            public. It clears within about 20 seconds; if it doesn&apos;t, the Localians service may be having trouble — try again shortly.
          </p>
        </Problem>

        <Problem id="limits" title="Usage limits" symptom="“You can share up to 5 apps at once” or “Daily bandwidth limit reached”">
          <p>
            Stop a preview you no longer need, or wait until the daily bandwidth limit resets at midnight UTC. The limits keep the service fast and
            prevent abuse.
          </p>
        </Problem>

        <Problem id="connection-lost" title="Connection lost" symptom="“Connection lost… Reconnecting in 3s…”, or Reconnecting in the dashboard">
          <p>
            Your computer&apos;s connection to Localians dropped (sleep, Wi-Fi change, VPN switch). The CLI reconnects by itself and keeps the same link
            while it can. If it keeps failing, check your internet connection, then stop and restart the share command.
          </p>
        </Problem>

        <Problem id="offline" title="The preview shows as offline" symptom="Reconnecting, Disconnected or Expired in Live Previews">
          <ul>
            <li>
              <strong>Reconnecting</strong> — the share command is trying to reconnect. Make sure it&apos;s still running and your computer is awake.
            </li>
            <li>
              <strong>Disconnected / Revoked / Expired</strong> — that share has ended for good and its link won&apos;t come back. Share again for a new link.
            </li>
          </ul>
        </Problem>

        <Problem id="hot-reload" title="Hot reload doesn't work through the preview">
          <p>
            Next.js needs your preview domain in <code className="font-mono">allowedDevOrigins</code> (see the{" "}
            <Link href={`${routes.frameworks}#nextjs`} className="text-fg underline underline-offset-4">Next.js guide</Link>). For other frameworks,
            check that you didn&apos;t pass <code className="font-mono">--host-header preserve</code> without allowing the preview host.
          </p>
        </Problem>

        <Problem id="network" title="Firewall, proxy or VPN interference" symptom="“Can’t reach Localians at …”, or repeated “Timed out connecting to the Localians gateway.”">
          <p>
            The CLI only makes outgoing HTTPS connections — you never need to open ports on your router. Some company networks, proxies or VPNs block
            the long-lived connection it uses. Try another network or disconnect the VPN; if that fixes it, ask your network admin to allow outgoing
            HTTPS (including WebSocket-style upgrades) to the Localians servers.
          </p>
        </Problem>

        <Problem id="npm-not-found" title="npm package not found / command not found" symptom={<>&ldquo;npm error 404 Not Found&rdquo; for <code className="font-mono">npx localians</code>, or &ldquo;localians is not recognized&rdquo;</>}>
          <p>
            The package isn&apos;t published to npm during the beta, so <code className="font-mono">npx localians</code> can&apos;t work yet. Install the
            beta from a Localians checkout (see the <Link href={routes.cliGuide} className="text-fg underline underline-offset-4">CLI guide</Link>). If
            <code className="font-mono"> localians</code> still isn&apos;t found after <code className="font-mono">npm link</code>, make sure npm&apos;s
            global folder is on your PATH:
          </p>
          <CodeLine>npm prefix -g</CodeLine>
        </Problem>

        <Problem id="certificates" title="Certificate warnings during local development" symptom="“self-signed certificate in certificate chain” in the CLI, or a browser privacy warning">
          <p>
            This only happens when the Localians server runs on your own machine with its development certificate. Trust the development CA (see{" "}
            <Link href={routes.cliGuide} className="text-fg underline underline-offset-4">CLI guide → certificates</Link>) instead of clicking through
            warnings. Real deployments use publicly trusted certificates.
          </p>
        </Problem>

        <p>
          Still stuck? Run the command with <code className="font-mono">-v</code> to see each request, and{" "}
          <Link href={routes.contact} className="text-fg underline underline-offset-4">contact us</Link> with what it prints (it never prints your
          access token).
        </p>
      </Prose>
    </SubPage>
  );
}
