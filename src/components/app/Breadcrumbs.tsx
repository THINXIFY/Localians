import { ChevronRight } from "lucide-react";
import Link from "next/link";

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-[13px] text-fg-3">
        {items.map((item, i) => (
          <li key={i} className="flex min-w-0 items-center gap-1">
            {item.href ? (
              <Link href={item.href} className="truncate transition-colors hover:text-fg">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate text-fg-2">
                {item.label}
              </span>
            )}
            {i < items.length - 1 ? <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}
