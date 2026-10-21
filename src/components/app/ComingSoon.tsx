import type { ReactNode } from "react";
import { PageHeader, SoonBadge } from "./Primitives";

export function ComingSoon({ title, description, icon, points }: { title: string; description: string; icon: ReactNode; points: string[] }) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={title} description={description} />
      <section className="flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-14 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl border border-line-strong bg-tint/[0.03] text-fg-2">{icon}</span>
        <div className="mt-4">
          <SoonBadge />
        </div>
        <h2 className="mt-4 text-[17px] font-semibold text-fg">Not available yet</h2>
        <p className="mt-1.5 max-w-[48ch] text-[14px] leading-relaxed text-fg-2">
          The full view is on its way. Until then, each project&apos;s page shows its current share. Nothing here is simulated.
        </p>
        <ul className="mt-6 grid max-w-[520px] gap-2 text-left text-[13.5px] text-fg-2 sm:grid-cols-2">
          {points.map((p) => (
            <li key={p} className="flex gap-2.5 rounded-lg border border-line bg-card px-3 py-2.5">
              <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-fg-3/60" />
              {p}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
