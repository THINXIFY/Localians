import type { Metadata } from "next";
import { GuideCta, GuideFaq, GuideLink, type FaqItem } from "@/components/sections/Guide";
import { CodeLine, Prose, SubPage } from "@/components/sections/SubPage";
import { pageMetadata } from "@/lib/seo";
import { routes } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "An ngrok Alternative for Sharing Web App Previews",
  description:
    "An ngrok alternative for showing local web apps to clients: one command, HTTPS preview links, password protection and a dashboard. See when each tool fits.",
  path: routes.ngrokAlternative,
});

const faq: FaqItem[] = [
  {
    question: "Is Localians a drop-in replacement for ngrok?",
    answer:
      "For sharing a local web app over HTTPS, yes: ngrok http 3000 becomes npx localians share 3000. For TCP or TLS tunnels, production traffic, or other ingress features, keep using a general-purpose tool like ngrok.",
  },
  {
    question: "Is Localians free?",
    answer: "Yes, Localians is free during the beta, within fair-use limits on simultaneous previews and daily traffic.",
  },
  {
    question: "Can I use both?",
    answer: "Of course. They don't conflict: Localians only connects the port you share, while the command is running.",
  },
];

const fit = [
  ["Show a web app in progress to a client or teammate", "Localians"],
  ["Password-protect a preview without changing your app", "Localians"],
  ["See who's connected and stop a preview from a dashboard", "Localians"],
  ["Tunnel raw TCP or TLS (databases, SSH, game servers)", "A general-purpose tunnel such as ngrok"],
  ["Run production traffic or an API gateway", "Proper hosting or a production ingress"],
] as const;

export default function NgrokAlternativePage() {
  return (
    <SubPage
      eyebrow="Comparison"
      title="A focused ngrok alternative for web app previews"
      intro="ngrok is a mature, general-purpose tunneling and ingress platform. Localians does one job: share the web app running on your computer with the people who need to see it — simply, securely, with a dashboard built around previews."
      back={{ href: routes.shareLocalhost, label: "Share localhost" }}
    >
      <Prose>
        <h2>The same first step</h2>
        <p>If you&apos;ve shared a local app with a tunnel before, the command will feel familiar:</p>
        <CodeLine label="Localians">npx localians share 3000</CodeLine>
        <p>You get an HTTPS link to your localhost that anyone can open — no account needed for them, no router or firewall changes for you.</p>

        <h2>What Localians is built for</h2>
        <ul>
          <li>
            <strong>Previews for people, not just traffic.</strong> Projects group your previews; the dashboard shows which links are live, their traffic,
            and lets you stop any of them instantly.
          </li>
          <li>
            <strong>Password protection built in.</strong> Visitors see a sign-in page first, without code changes in your app. Changing the password signs
            everyone out.
          </li>
          <li>
            <strong>Dev-server friendly by default.</strong> Requests reach your app as <code className="font-mono">localhost:&lt;port&gt;</code>, so Vite,
            Angular and similar servers work without host configuration; WebSockets and hot reload pass through.
          </li>
          <li>
            <strong>Guided sharing.</strong> The dashboard&apos;s Share App page prepares the command for you, including the project and protection.
          </li>
        </ul>

        <h2>Which tool fits?</h2>
        <div className="not-prose overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-[14px] sm:text-[14.5px]">
            <caption className="sr-only">Which tool fits which job</caption>
            <thead className="border-b border-line bg-tint/[0.03] text-fg">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  You want to…
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Good fit
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {fit.map(([job, tool]) => (
                <tr key={job}>
                  <td className="px-4 py-3 text-fg-2">{job}</td>
                  <td className="px-4 py-3 text-fg">{tool}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Feature sets and plans change; check ngrok&apos;s own documentation for its current options. Localians is in beta and free while it grows.
        </p>

        <h2>Switching takes a minute</h2>
        <ol>
          <li>
            <GuideLink href={routes.getStarted}>Create a free account</GuideLink>.
          </li>
          <li>
            Run <code className="font-mono">npx localians share &lt;port&gt;</code> next to your running app and approve the login once.
          </li>
          <li>Send the link. Add a password in the dashboard if the work is private.</li>
        </ol>
        <p>
          Framework notes: <GuideLink href={routes.shareNextjs}>Next.js</GuideLink>, <GuideLink href={routes.shareVite}>Vite</GuideLink>,{" "}
          <GuideLink href={routes.frameworks}>others</GuideLink>.
        </p>
      </Prose>

      <GuideFaq items={faq} />
      <GuideCta name="ngrok alternative" path={routes.ngrokAlternative} />
    </SubPage>
  );
}
