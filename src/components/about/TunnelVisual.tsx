import { Globe, Laptop, Lock } from "lucide-react";
import { site } from "@/lib/site";

/**
 * Decorative localhost → Localians → browser diagram. The moving light on each link is pure CSS (the existing `travel`
 * animation, which reduced-motion settings stop), so there's no script to hydrate.
 */
function Wire() {
  return (
    <span aria-hidden="true" className="relative mx-1 h-px min-w-6 flex-1 overflow-hidden bg-line-strong sm:mx-3">
      <span className="absolute inset-y-0 left-0 w-1/3 animate-travel bg-gradient-to-r from-transparent via-accent to-transparent" />
    </span>
  );
}

function Node({ icon: Icon, label, detail, accent }: { icon: typeof Laptop; label: string; detail: string; accent?: boolean }) {
  return (
    <div className="flex w-[84px] shrink-0 flex-col items-center gap-2 text-center sm:w-[120px]">
      <span className={`grid size-12 place-items-center rounded-2xl border sm:size-14 ${accent ? "border-accent/40 bg-accent/10 text-accent" : "border-line-strong bg-card text-fg-2"}`}>
        <Icon className="size-5 sm:size-6" aria-hidden="true" />
      </span>
      <span className="text-[12.5px] font-medium text-fg sm:text-[13.5px]">{label}</span>
      <span className="max-w-full truncate font-mono text-[10.5px] text-fg-3 sm:text-[11.5px]">{detail}</span>
    </div>
  );
}

export function TunnelVisual() {
  return (
    <figure className="mx-auto mt-14 w-full max-w-[640px] sm:mt-16">
      <div className="surface hairline-top flex items-start justify-between px-4 py-7 sm:px-8 sm:py-9">
        <Node icon={Laptop} label="Your app" detail="localhost:3000" />
        <span className="mt-6 flex flex-1 items-center sm:mt-7">
          <Wire />
        </span>
        <Node icon={Lock} label="Localians" detail="HTTPS tunnel" accent />
        <span className="mt-6 flex flex-1 items-center sm:mt-7">
          <Wire />
        </span>
        <Node icon={Globe} label="Anyone" detail="any browser" />
      </div>
      <figcaption className="sr-only">
        Localians connects your local app, running on your computer, to anyone with the link through a secure HTTPS tunnel. Example: {site.command}.
      </figcaption>
    </figure>
  );
}
