import { ImageResponse } from "next/og";

export const alt = "LogicSRC — Open Coordination Standards for Humans & AI Agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Branded 1200×630 social card generated at build/request time.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: "#101418",
          color: "#f6f7f4",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "96px",
              height: "96px",
              border: "3px solid #5ac8a6",
              borderRadius: "16px",
              color: "#5ac8a6",
              fontSize: "44px",
              fontWeight: 800,
            }}
          >
            LS
          </div>
          <div style={{ fontSize: "72px", fontWeight: 800 }}>LogicSRC</div>
        </div>
        <div style={{ marginTop: "40px", fontSize: "38px", color: "#b5beb2", lineHeight: 1.3 }}>
          Open schemas, primitives, and conventions for coordination between
          humans, AI agents, plugins, and hosted products.
        </div>
        <div style={{ marginTop: "auto", fontSize: "28px", color: "#5ac8a6" }}>
          logicsrc.com
        </div>
      </div>
    ),
    size,
  );
}
