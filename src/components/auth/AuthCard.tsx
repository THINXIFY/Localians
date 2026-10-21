import type { ReactNode } from "react";

export function AuthCard({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div>
      <div className="rounded-[20px] border border-line bg-card/90 p-6 shadow-[0_40px_100px_-50px_rgba(0,0,0,0.9)] backdrop-blur sm:p-8">
        <h1 className="text-[24px] font-semibold tracking-[-0.03em] text-fg">{title}</h1>
        {description ? <p className="mt-1.5 text-[14.5px] leading-relaxed text-fg-2">{description}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
      {footer ? <div className="mt-5 text-center text-[14px] text-fg-2">{footer}</div> : null}
    </div>
  );
}

export function Divider({ label }: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-[12px] uppercase tracking-[0.14em] text-fg-3">
      <span className="h-px flex-1 bg-line" />
      {label}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
