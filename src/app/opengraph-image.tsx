import { ImageResponse } from "next/og";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

export const alt = `${APP_NAME} — open-source URL shortener`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
        background: "linear-gradient(135deg, #0a0a0a 0%, #262626 100%)",
        color: "#fafafa",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 24,
            background: "#fafafa",
            color: "#0a0a0a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 56,
            fontWeight: 700,
          }}
        >
          ↗
        </div>
        <div style={{ fontSize: 80, fontWeight: 700, letterSpacing: -2 }}>{APP_NAME}</div>
      </div>
      <div style={{ marginTop: 40, fontSize: 40, color: "#a3a3a3", maxWidth: 900 }}>{APP_TAGLINE}</div>
    </div>,
    size,
  );
}
