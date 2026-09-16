import { ImageResponse } from "next/og";

export const alt = "Flujos de Automatización · Célula de Mejora Operativa";
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
          justifyContent: "center",
          gap: 28,
          padding: "0 96px",
          background: "#f4f5f7",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 18,
              background: "#2e75b6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="42" height="42" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.7">
              <rect x="1.5" y="2" width="4" height="4" rx="1" />
              <rect x="10.5" y="2" width="4" height="4" rx="1" />
              <rect x="6" y="10" width="4" height="4" rx="1" />
              <path d="M5.5 4h5M12.5 6v2.5H8V10M3.5 6v2.5H8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: "#5b6575",
            }}
          >
            Célula de Mejora Operativa
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 68, fontWeight: 700, color: "#1d2430", lineHeight: 1.15 }}>
          Flujos de Automatización
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#45505f", maxWidth: 880 }}>
          Sigue el avance de cada paso, documento y material de apoyo de tus automatizaciones.
        </div>
      </div>
    ),
    { ...size },
  );
}
