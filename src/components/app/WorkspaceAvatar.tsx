import { cn } from "@/lib/cn";

/** Muted hues for generated avatars (picked from the name, so a workspace keeps its colour). */
const HUES = [145, 175, 205, 235, 265, 25, 55, 85];
const hueFor = (name: string) => HUES[Array.from(name).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length];

/** A workspace's uploaded avatar, or a generated tile with its initial. Square with rounded corners (not a person). */
export function WorkspaceAvatar({ name, url, size = 28, className }: { name: string; url: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size };
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- access-checked, already-resized 256px WebP from our own route
      <img src={url} alt="" width={size} height={size} loading="lazy" decoding="async" className={cn("shrink-0 rounded-md border border-line object-cover", className)} style={style} data-testid="workspace-avatar-image" />
    );
  }
  const hue = hueFor(name);
  return (
    <span
      aria-hidden="true"
      data-testid="workspace-avatar-generated"
      style={{ ...style, fontSize: Math.round(size * 0.42), background: `hsl(${hue} 30% 18%)`, color: `hsl(${hue} 55% 78%)`, borderColor: `hsl(${hue} 30% 28%)` }}
      className={cn("flex shrink-0 items-center justify-center rounded-md border font-semibold", className)}
    >
      {(name.trim().charAt(0) || "W").toUpperCase()}
    </span>
  );
}
