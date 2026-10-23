import { ArrowRight, Code2 } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { routes } from "@/lib/site";

/** A slim homepage section pointing at the VS Code extension page. `available` is false until it is released. */
export function VsCodeBand({ available }: { available: boolean }) {
  return (
    <section aria-labelledby="vscode-band-title" className="relative py-6 sm:py-10">
      <div className="container-x">
        <Reveal className="surface hairline-top flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-line-strong bg-card text-accent" aria-hidden="true">
              <Code2 className="size-5" />
            </span>
            <div>
              <h2 id="vscode-band-title" className="flex flex-wrap items-center gap-2 text-[20px] font-semibold tracking-[-0.02em] text-fg">
                Share from VS Code
                {available ? null : <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-accent">Coming soon</span>}
              </h2>
              <p className="mt-1.5 max-w-[52ch] text-[14.5px] leading-relaxed text-fg-2">
                Turn your running dev server into an HTTPS preview link without leaving your editor: connect once, click Share, send the link.
              </p>
            </div>
          </div>
          <ButtonLink href={routes.vscodeExtension} variant="secondary" className="shrink-0">
            {available ? "Get the extension" : "Learn more"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </ButtonLink>
        </Reveal>
      </div>
    </section>
  );
}
