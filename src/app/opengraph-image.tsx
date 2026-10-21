import { ImageResponse } from "next/og";

export const alt = "Localians — Your localhost. Anyone's browser.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#070907",
          backgroundImage:
            "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(184,255,59,0.18), transparent), linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "100% 100%, 56px 56px, 56px 56px",
          color: "#F7F8F5",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 22, height: 22, background: "#B8FF3B", borderRadius: 5 }} />
          <div style={{ fontSize: 28, letterSpacing: 6, fontWeight: 600 }}>LOCALIANS</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 86, fontWeight: 700, letterSpacing: -3, lineHeight: 1.02 }}>Your localhost.</div>
          <div style={{ fontSize: 86, fontWeight: 700, letterSpacing: -3, lineHeight: 1.02, color: "#B8FF3B" }}>
            Anyone&apos;s browser.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            fontSize: 26,
            fontFamily: "monospace",
            padding: "14px 22px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(0,0,0,0.5)",
          }}
        >
          <span style={{ color: "#B8FF3B", marginRight: 14 }}>$</span>
          npx localians share 3000
        </div>
      </div>
    ),
    size,
  );
}
