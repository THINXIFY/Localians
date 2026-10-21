import { Eyebrow } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/ui/Reveal";

const tools = [
  { name: "Next.js", kind: "Framework" },
  { name: "React", kind: "Library" },
  { name: "Vue", kind: "Framework" },
  { name: "Vite", kind: "Build tool" },
  { name: "Node.js", kind: "Runtime" },
];

export function TechStrip() {
  return (
    <section aria-labelledby="workflow-title" className="relative pb-6 pt-20 sm:pt-28">
      <div className="container-x">
        <Reveal className="flex flex-col items-center gap-3 text-center">
          <Eyebrow>Built for your workflow</Eyebrow>
          <h2 id="workflow-title" className="text-[19px] font-medium tracking-[-0.015em] text-fg sm:text-[22px]">
            Works with the tools you already love.
          </h2>
        </Reveal>

        <Reveal delay={0.08}>
          {/* gap-px over a line-coloured background draws hairline dividers at every breakpoint */}
          <ul className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-5">
            {tools.map((tool, i) => (
              <li
                key={tool.name}
                className={`group flex h-24 flex-col items-center justify-center gap-1 bg-bg transition-colors hover:bg-bg-2 sm:h-28 ${
                  i === tools.length - 1 ? "col-span-2 sm:col-span-1" : ""
                }`}
              >
                <span className="text-[20px] font-semibold tracking-[-0.03em] text-fg-2 transition-colors duration-300 group-hover:text-fg sm:text-[21px] lg:text-[23px]">
                  {tool.name}
                </span>
                <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-3">{tool.kind}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-center text-[12px] text-fg-3">
            Names are trademarks of their respective owners. No affiliation or endorsement implied.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
