import type { Metadata } from "next";
import { Prose, SubPage } from "@/components/sections/SubPage";
import { routes } from "@/lib/site";
import { pageMetadata, breadcrumbs } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";

export const metadata: Metadata = pageMetadata({
  title: "Security: Public and Password-Protected Preview Links",
  description: "Who can open a Localians preview, how password protection works, what is and isn't stored, and how to stop sharing or revoke a CLI login.",
  path: routes.security,
});

export default function SecurityPage() {
  return (
    <SubPage
      eyebrow="Security"
      title="Sharing safely"
      intro="Who can open a preview link, how password protection works, what Localians does to protect your computer, and how to switch sharing off."
      back={{ href: routes.docs, label: "Documentation" }}
      notice={
        <>
          <strong className="font-medium text-fg">Public previews can be opened by anyone with the link.</strong> Turn on password protection to
          restrict access.
        </>
      }
    >
      <Prose>
        <h2>Public or password protected</h2>
        <p>
          Every project is <strong>public</strong> or <strong>password protected</strong>, and its preview links follow that setting. Choose it in
          the Share App wizard, or on the project page under <strong>Preview access</strong>. Changes apply immediately, including to links that are
          already live.
        </p>
        <ul>
          <li>
            <strong>Public:</strong> anyone who has the link can open the app while you share. Links are long and random, so they can&apos;t
            realistically be guessed — but they can be forwarded or pasted into chats.
          </li>
          <li>
            <strong>Password protected:</strong> visitors see a Localians password page first. The same protection covers pages, API calls and
            WebSockets (hot reload, live updates). Nothing reaches your app until the password is right.
          </li>
        </ul>

        <h2>How password protection works</h2>
        <ul>
          <li>Passwords need at least 8 characters and are stored only as a salted scrypt hash. Localians can&apos;t show you the password later.</li>
          <li>After the right password, the visitor&apos;s browser gets a signed cookie for that one preview link. It isn&apos;t sent to your app.</li>
          <li>
            Visitors stay signed in for the time you choose (1 hour to 7 days). <strong>Changing the password</strong> or{" "}
            <strong>Sign out all visitors</strong> ends every visitor&apos;s access at once.
          </li>
          <li>Wrong guesses are rate limited per visitor and per preview, so passwords can&apos;t be brute forced quickly.</li>
          <li>Send the password separately from the link (for example, link by email, password by chat).</li>
        </ul>

        <h2>What not to share</h2>
        <p>A password lowers the risk but doesn&apos;t make a development server production-ready. Avoid sharing:</p>
        <ul>
          <li>Apps connected to real customer data, production databases or real payment keys.</li>
          <li>Admin panels or tools without their own login.</li>
        </ul>
        <p>Use test data, and keep your app&apos;s own login for anything sensitive.</p>

        <h2>What Localians protects</h2>
        <ul>
          <li>Visitors only reach the one port you shared, on your own computer — never other ports or other machines on your network.</li>
          <li>You never open ports on your router: the CLI makes an outgoing, encrypted connection.</li>
          <li>Localians&apos; own cookies are removed before requests reach your app, and forwarded-for headers can&apos;t be spoofed.</li>
          <li>The CLI uses its own revocable token, never your dashboard session, and never prints it.</li>
          <li>Requests, connections and bandwidth are limited per preview and per workspace to prevent abuse.</li>
          <li>Localians stores connection times and traffic totals, not page contents, request bodies or cookies.</li>
        </ul>

        <h2>Your computer must stay online</h2>
        <p>
          The preview is served from your machine. If your app stops, your computer sleeps, or you close the share command, visitors see an
          &ldquo;isn&apos;t running&rdquo; or &ldquo;isn&apos;t active&rdquo; page — never a stale copy. Localians isn&apos;t a hosting service.
        </p>

        <h2>Stopping and revoking</h2>
        <ul>
          <li>
            <strong>Stop one preview:</strong> Ctrl+C in its terminal, or <strong>Stop Sharing</strong> in the dashboard. The link stops working
            immediately, can&apos;t reconnect, and is never reused.
          </li>
          <li>
            <strong>End visitor access but keep sharing:</strong> change the password, or use <strong>Sign out all visitors</strong>.
          </li>
          <li>
            <strong>Revoke a computer:</strong> Settings → CLI → Revoke, or <code className="font-mono">localians logout</code> on that computer.
            Everything it was sharing stops.
          </li>
          <li>
            <strong>Automatic limits:</strong> a share stops when the project&apos;s free 24-hour window (or its 7-Day Pass) ends, or earlier if you set an auto-stop; CLI logins expire after 90 days, and dashboard setup
            commands work once within 30 minutes.
          </li>
        </ul>
      </Prose>
      <JsonLd data={breadcrumbs([{ name: "Documentation", path: routes.docs }, { name: "Security", path: routes.security }])} />
    </SubPage>
  );
}
