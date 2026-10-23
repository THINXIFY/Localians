import type { Metadata } from "next";
import Link from "next/link";
import { CodeLine, Prose, SubPage } from "@/components/sections/SubPage";
import { routes } from "@/lib/site";
import { pageMetadata, breadcrumbs } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";

export const metadata: Metadata = pageMetadata({
  title: "Framework Guides: Next.js, Vite, Angular, Django and More",
  description: "Which port to share and what to configure for hot reload when sharing Next.js, Vite, Vue, Angular, Django, Rails, Flask and Express from localhost.",
  path: routes.frameworks,
});

const frameworks = [
  { id: "nextjs", name: "Next.js" },
  { id: "vite", name: "React with Vite" },
  { id: "vue", name: "Vue" },
  { id: "angular", name: "Angular" },
  { id: "other", name: "Other servers" },
];

export default function FrameworksPage() {
  return (
    <SubPage
      eyebrow="Framework guides"
      title="Share any local dev server"
      intro="Start your app the usual way, then run npx localians share with the port it prints. Default ports are listed below, but always use the one your terminal shows: it changes if the default is busy or configured differently."
      back={{ href: routes.docs, label: "Documentation" }}
      notice={
        <>
          Verified end to end in our test suite: <strong className="font-medium text-fg">Next.js</strong> and{" "}
          <strong className="font-medium text-fg">Vite</strong>, including hot reload. Vue, Angular and the other servers below use the same standard HTTP
          and WebSocket features but aren&apos;t yet covered by automated tests.
        </>
      }
    >
      <nav aria-label="Frameworks" className="mb-10 flex flex-wrap gap-2">
        {frameworks.map((f) => (
          <a key={f.id} href={`#${f.id}`} className="rounded-full border border-line px-3 py-1 text-[13.5px] text-fg-2 transition-colors hover:border-line-strong hover:text-fg">
            {f.name}
          </a>
        ))}
      </nav>
      <Prose>
        <h2 id="nextjs">Next.js</h2>
        <p>Usually port 3000.</p>
        <CodeLine>{"npm run dev\nnpx localians share 3000"}</CodeLine>
        <p>
          <strong>Hot reload:</strong> Next.js blocks its development resources for other origins. Allow Localians preview links in{" "}
          <code className="font-mono">next.config.js</code>:
        </p>
        <CodeLine>{`allowedDevOrigins: ["*.preview.localians.com"]`}</CodeLine>
        <p>
          Without it, pages still load, but edits won&apos;t appear live for the person viewing the preview. More in{" "}
          <Link href={routes.shareNextjs} className="text-fg underline underline-offset-4">
            sharing a Next.js app
          </Link>
          .
        </p>

        <h2 id="vite">React with Vite</h2>
        <p>Usually port 5173. Works without changes, hot reload included.</p>
        <CodeLine>{"npm run dev\nnpx localians share 5173"}</CodeLine>
        <p>
          If you share with <code className="font-mono">--host-header preserve</code>, add the preview domain to{" "}
          <code className="font-mono">server.allowedHosts</code> in <code className="font-mono">vite.config</code>.
        </p>

        <h2 id="vue">Vue</h2>
        <p>
          Projects created with <code className="font-mono">npm create vue</code> use Vite: usually port 5173. Older Vue CLI projects use{" "}
          <code className="font-mono">npm run serve</code> on port 8080.
        </p>
        <CodeLine label="Vite (create-vue)">{"npm run dev\nnpx localians share 5173"}</CodeLine>
        <CodeLine label="Vue CLI">{"npm run serve\nnpx localians share 8080"}</CodeLine>

        <h2 id="angular">Angular</h2>
        <p>Usually port 4200.</p>
        <CodeLine>{"npm start\nnpx localians share 4200"}</CodeLine>
        <p>
          <code className="font-mono">ng serve</code> works the same way. If you pass <code className="font-mono">--host-header preserve</code>, also start
          Angular with <code className="font-mono">--allowed-hosts</code> for the preview domain.
        </p>

        <h2 id="other">Other HTTP servers</h2>
        <p>Anything that answers HTTP on a local port can be shared. Common defaults:</p>
        <ul>
          <li>
            Express / Node: whatever your code passes to <code className="font-mono">listen()</code>, often 3000 or 8080.
          </li>
          <li>
            Django: <code className="font-mono">python manage.py runserver</code> — 8000.
          </li>
          <li>
            Rails: <code className="font-mono">bin/rails server</code> — 3000.
          </li>
          <li>
            Flask: <code className="font-mono">flask run</code> — 5000.
          </li>
          <li>
            Laravel: <code className="font-mono">php artisan serve</code> — 8000.
          </li>
        </ul>
        <CodeLine>npx localians share 8000</CodeLine>
        <p>
          By default your app sees requests as coming to <code className="font-mono">localhost:&lt;port&gt;</code>, which keeps host checks happy. If
          your app builds absolute links from the request host, those links will point at localhost — use{" "}
          <code className="font-mono">--host-header preserve</code> and allow the preview domain in the framework&apos;s allowed-hosts setting.
        </p>
        <p>
          Something not working? See <Link href={routes.troubleshooting} className="text-fg underline underline-offset-4">Troubleshooting</Link>.
        </p>
      </Prose>
      <JsonLd data={breadcrumbs([{ name: "Documentation", path: routes.docs }, { name: "Framework Guides", path: routes.frameworks }])} />
    </SubPage>
  );
}
