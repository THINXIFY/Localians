import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Code2, Layers, LifeBuoy, ShieldCheck, TerminalSquare } from "lucide-react";
import { Prose, SubPage } from "@/components/sections/SubPage";
import { guideLinks, routes } from "@/lib/site";
import { pageMetadata, breadcrumbs } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";

export const metadata: Metadata = pageMetadata({
  title: "Documentation: Share Localhost with HTTPS Preview Links",
  description: "Localians documentation: share a local dev server with one command, protect previews with a password, use the CLI, and fix common problems.",
  path: routes.docs,
});

const guides = [
  {
    href: routes.gettingStarted,
    icon: BookOpen,
    title: "Getting Started",
    description: "Share your first localhost app in 60 seconds.",
  },
  {
    href: routes.cliGuide,
    icon: TerminalSquare,
    title: "CLI Guide",
    description: "Install, share, sign in, check status and stop sharing.",
  },
  {
    href: routes.vscodeDocs,
    icon: Code2,
    title: "VS Code Extension",
    description: "Share a running app from your editor, with a click.",
  },
  {
    href: routes.frameworks,
    icon: Layers,
    title: "Framework Guides",
    description: "Next.js, React with Vite, Vue, Angular and other servers.",
  },
  {
    href: routes.troubleshooting,
    icon: LifeBuoy,
    title: "Troubleshooting",
    description: "Fixes for the messages you might see.",
  },
  {
    href: routes.security,
    icon: ShieldCheck,
    title: "Security",
    description: "Who can open a preview, and how to stop sharing.",
  },
];

export default function DocsPage() {
  return (
    <SubPage
      eyebrow="Documentation"
      title="Localians documentation"
      intro="Everything you need to share a locally running web app with a secure HTTPS preview link."
      notice={
        <>
          <strong className="font-medium text-fg">Early beta.</strong> These docs cover today&apos;s workflow and will grow
          as features ship.
        </>
      }
    >
      <ul className="grid gap-4 sm:grid-cols-2">
        {guides.map((g) => (
          <li key={g.href}>
            <Link
              href={g.href}
              className="group surface flex h-full flex-col p-6 transition-colors hover:border-line-strong"
            >
              <g.icon className="size-5 text-accent" aria-hidden="true" />
              <span className="mt-5 flex items-center gap-2 text-[17px] font-semibold text-fg">
                {g.title}
                <ArrowRight className="size-4 text-fg-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
              <span className="mt-1.5 text-[14.5px] text-fg-2">{g.description}</span>
            </Link>
          </li>
        ))}
      </ul>

      <nav aria-labelledby="guides-title" className="mt-12">
        <h2 id="guides-title" className="text-[17px] font-semibold text-fg">
          Guides
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {guideLinks.map((g) => (
            <li key={g.href}>
              <Link href={g.href} className="inline-flex rounded-full border border-line px-3.5 py-1.5 text-[14px] text-fg-2 transition-colors hover:border-line-strong hover:text-fg">
                {g.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-14">
        <Prose>
          <h2>How Localians works</h2>
          <p>
            Localians connects a public HTTPS preview URL to a development server running on your machine. Visitors open the
            link in their browser and are routed to your local app. Nothing is deployed and your code stays on your
            computer.
          </p>
          <p>
            Because the preview is served from your machine, <strong>your development server and the Localians connection must
            keep running</strong> for the link to work. Localians is not a replacement for production hosting.
          </p>
        </Prose>
      </div>
      <JsonLd data={breadcrumbs([{ name: "Documentation", path: routes.docs }])} />
    </SubPage>
  );
}
