import Link from "next/link";
import type { ReactNode } from "react";
import { Prose } from "@/components/sections/SubPage";
import { site } from "@/lib/site";

export type LegalSection = { id: string; title: string; body: ReactNode };

export const EFFECTIVE_DATE = "October 23, 2026";

/** "Effective date · Contact" line shown under a legal page's title. */
export function LegalMeta({ date = EFFECTIVE_DATE }: { date?: string }) {
  return (
    <p className="mt-5 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12.5px] text-fg-3">
      <span>
        Effective date: <span className="text-fg-2">{date}</span>
      </span>
      <span>
        Contact:{" "}
        <a href={`mailto:${site.supportEmail}`} className="text-fg-2 underline-offset-4 hover:text-fg hover:underline">
          {site.supportEmail}
        </a>
      </span>
    </p>
  );
}

/** Long-form legal text with a table of contents: a collapsible list on small screens, a sticky side column on desktop. */
export function LegalDocument({ sections }: { sections: LegalSection[] }) {
  const toc = (
    <ol className="space-y-0.5 text-[13.5px]">
      {sections.map((s, i) => (
        <li key={s.id}>
          <a href={`#${s.id}`} className="flex gap-2 rounded-md px-2 py-1.5 text-fg-3 transition-colors hover:bg-tint/[0.05] hover:text-fg">
            <span aria-hidden="true" className="w-5 shrink-0 font-mono text-[11.5px] leading-[1.6] text-fg-3">
              {i + 1}.
            </span>
            {s.title}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-14">
      <nav aria-label="On this page" className="lg:sticky lg:top-[calc(var(--header-h)+24px)] lg:self-start">
        <details className="rounded-[var(--radius-card)] border border-line px-4 py-3 lg:hidden">
          <summary className="cursor-pointer text-[14px] font-medium text-fg">On this page</summary>
          <div className="mt-3">{toc}</div>
        </details>
        <div className="hidden lg:block">
          <p className="mb-3 px-2 font-mono text-[11px] uppercase tracking-[0.16em] text-fg-3">On this page</p>
          {toc}
        </div>
      </nav>

      <div className="min-w-0 max-w-[68ch]">
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-[calc(var(--header-h)+24px)] border-t border-line pb-10 pt-8 first:border-t-0 first:pt-0">
            <h2 id={`${s.id}-title`} className="text-[21px] font-semibold tracking-[-0.02em] text-fg">
              <span className="mr-2 font-mono text-[14px] text-accent">{i + 1}.</span>
              {s.title}
            </h2>
            <div className="mt-4">
              <Prose>{s.body}</Prose>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Internal link styled for use inside legal prose. */
export function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-fg underline decoration-white/25 underline-offset-4 transition-colors hover:decoration-accent">
      {children}
    </Link>
  );
}

export function MailLink() {
  return (
    <a href={`mailto:${site.supportEmail}`} className="text-fg underline decoration-white/25 underline-offset-4 transition-colors hover:decoration-accent">
      {site.supportEmail}
    </a>
  );
}
