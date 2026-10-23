import Link from "next/link";
import { DEVELOPER } from "@/components/ui/Credit";
import { Logo } from "@/components/ui/Logo";
import { footerColumns } from "@/lib/site";

export function Footer() {
  return (
    <footer className="border-t border-line bg-bg">
      <div className="container-x pb-8 pt-14 sm:pt-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.85fr)] lg:gap-12">
          <div className="max-w-[340px]">
            <Logo height={30} />
            <p className="mt-4 text-[14.5px] leading-relaxed text-fg-2">Secure localhost previews. Share your work with anyone, anywhere.</p>
            <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-line px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-3">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
              Built for developers
            </p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
            {footerColumns.map((col) => (
              <div key={col.title} className="min-w-0">
                <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-fg-3">{col.title}</h2>
                <ul className="mt-3.5 space-y-0.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="inline-flex min-h-8 items-center whitespace-nowrap text-[14px] text-fg-2 transition-colors duration-200 hover:text-fg focus-visible:text-fg"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-line pt-6 text-[13px] text-fg-3 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Localians. All rights reserved.</p>
          <p>
            Built by{" "}
            <a href={DEVELOPER.url} target="_blank" rel="noopener noreferrer" className="text-fg-2 underline-offset-4 transition-colors duration-200 hover:text-fg hover:underline">
              THINXIFY Technologies
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
