import { ImageResponse } from "next/og";
import { APP_NAME } from "@/lib/constants";

export const alt = `${APP_NAME}: the open-source URL shortener`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BARS = [18, 22, 20, 26, 24, 30, 92, 74, 52, 40, 36, 44, 58, 48, 42, 38];

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "#faf8f5",
        color: "#1a1814",
        fontFamily: "sans-serif",
        fontWeight: 700,
        letterSpacing: -2,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: "#0f7a55",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
          }}
        >
          ↗
        </div>
        <div style={{ fontSize: 44 }}>{APP_NAME}</div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 48 }}>
        <div
          style={{ display: "flex", flexDirection: "column", fontSize: 84, lineHeight: 1.02, maxWidth: 680 }}
        >
          <span>Short links you own.</span>
          <span style={{ color: "#0f7a55" }}>Numbers you can trust.</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 180 }}>
          {BARS.map((h, i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: h * 1.8,
                borderRadius: 4,
                background: i === 6 ? "#0f7a55" : "#bfe0cf",
              }}
            />
          ))}
        </div>
      </div>
    </div>,
    size,
  );
}
