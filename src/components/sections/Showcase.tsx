import { DashboardDemo } from "@/components/demo/DashboardDemo";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";

export function Showcase() {
  return (
    <section aria-labelledby="showcase-title" className="section-y relative isolate overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="absolute left-1/2 top-[38%] h-[520px] w-[min(1000px,120vw)] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(184,255,59,0.07),transparent)]" />
        <div className="bg-grid absolute inset-0 opacity-60 [mask-image:radial-gradient(60%_50%_at_50%_60%,#000,transparent)]" />
      </div>

      <div className="container-x">
        <SectionHeader
          id="showcase-title"
          eyebrow="One clean workspace"
          title="Every preview. Under control."
          description="Manage your projects, monitor connections, and share preview links from one beautifully simple dashboard."
        />

        <Reveal y={32} className="mt-14 sm:mt-16">
          <DashboardDemo />
          <p className="mx-auto mt-5 max-w-[60ch] text-center text-[12.5px] text-fg-3">
            Interactive concept with sample data. Selecting a project and copying a link work locally on this page; no
            real tunnels or accounts are involved.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
