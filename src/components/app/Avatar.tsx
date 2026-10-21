import { cn } from "@/lib/cn";

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function Avatar({ name, image, size = 32, className }: { name: string; image?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size };
  if (image && image.startsWith("https://")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- user-supplied remote avatar; no image optimisation domain to allow-list
      <img
        src={image}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className={cn("shrink-0 rounded-full border border-line object-cover", className)}
        style={style}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: Math.round(size * 0.38) }}
      className={cn("flex shrink-0 items-center justify-center rounded-full border border-line-strong bg-elevated font-semibold text-fg-2", className)}
    >
      {initials(name)}
    </span>
  );
}
