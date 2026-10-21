import Link from "next/link";
import { DevelopedBy } from "@/components/ui/Credit";
import { Logo } from "@/components/ui/Logo";
import { footerColumns } from "@/lib/site";

export function Footer() {
  return (
    <footer className="border-t border-line bg-bg">
      <div className="container-x pb-10 pt-16 sm:pt-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
          <div className="max-w-[300px]">
            <Logo />
            <p className="mt-5 text-[14.5px] leading-relaxed text-fg-2">
              Secure localhost previews for developers who move fast.
            </p>
            <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 font-mono text-[11px] text-fg-3">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
              Stage 1 · Free beta
            </p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
            {footerColumns.map((col) => (
              <div key={col.title}>
                <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-fg-3">{col.title}</h2>
                <ul className="mt-4 space-y-3">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link href={link.href} className="text-[14px] text-fg-2 transition-colors hover:text-fg">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-line pt-8 text-[13px] text-fg-3 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © 2026 Localians. All rights reserved. <span className="text-fg-2">Your localhost. Anywhere.</span>
          </p>
          <DevelopedBy className="text-[13px]" />
        </div>
      </div>
    </footer>
  );
}
