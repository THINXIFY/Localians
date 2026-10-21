import { Check } from "lucide-react";
import { PortPanel } from "@/components/demo/PortPanel";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";

const capabilities = [
  { key: "HTTP development servers", value: "Anything serving HTTP on a local port" },
  { key: "HTTPS preview URLs", value: "Every share is reached over https://" },
  { key: "WebSocket support", value: "Socket connections pass through the tunnel" },
  { key: "Hot reload compatibility", value: "Works where your dev server's HMR runs over WebSockets" },
  { key: "Common local development ports", value: "3000, 4200, 5173, 8080 and more" },
];

export function Frameworks() {
  return (
    <section aria-labelledby="frameworks-title" className="section-y relative">
      <div className="container-x grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
        <div>
          <SectionHeader
            align="left"
            id="frameworks-title"
            eyebrow="Framework friendly"
            title="Your stack. Your rules."
            description="Whether you're building with Next.js, React, Vue, or another local web server, sharing your work should feel effortless."
          />

          <Reveal delay={0.08}>
            <ul className="mt-10 divide-y divide-line border-y border-line">
              {capabilities.map((c) => (
                <li key={c.key} className="flex items-start gap-3.5 py-3.5">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border border-accent/30 bg-accent/[0.08] text-accent">
                    <Check className="size-3" aria-hidden="true" />
                  </span>
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[15px] font-medium text-fg">{c.key}</span>
                    <span className="text-[13.5px] text-fg-3">{c.value}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[12.5px] leading-relaxed text-fg-3">
              Compatibility depends on your development server and the features it uses.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.12} y={24}>
          <PortPanel />
        </Reveal>
      </div>
    </section>
  );
}
