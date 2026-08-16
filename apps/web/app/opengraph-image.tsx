import { ImageResponse } from "next/og";

export const alt = "VEXONYX — AI cybersecurity and authorized penetration testing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#08090b",
        color: "#111317",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: 1040,
          height: 470,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "70px 82px",
          borderRadius: 38,
          background: "#f7f6f3",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 650 }}>
          <div style={{ display: "flex", fontSize: 62, fontWeight: 700, letterSpacing: 10 }}>VEXONYX</div>
          <div style={{ display: "flex", fontSize: 34, lineHeight: 1.22, letterSpacing: -1 }}>
            AI cybersecurity & authorized penetration testing
          </div>
          <div style={{ display: "flex", fontSize: 20, color: "#626872" }}>
            Assess · Validate · Capture evidence · Report
          </div>
        </div>
        <div
          style={{
            width: 230,
            height: 230,
            borderRadius: 48,
            background: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid #e4e2dd",
          }}
        >
          <div style={{ display: "flex", fontSize: 150, fontWeight: 800, lineHeight: 1, letterSpacing: -16 }}>X</div>
          <div style={{ width: 18, height: 70, background: "#7658ef", transform: "skew(-32deg)", marginLeft: -38, marginTop: -62 }} />
        </div>
      </div>
    </div>,
    size,
  );
}
