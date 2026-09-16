import { ImageResponse } from "next/og";

// iOS aplica su propia máscara redondeada, así que este va sin borde ni esquinas.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2e75b6",
        }}
      >
        <svg width="118" height="118" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.3">
          <rect x="1.5" y="2" width="4" height="4" rx="1" />
          <rect x="10.5" y="2" width="4" height="4" rx="1" />
          <rect x="6" y="10" width="4" height="4" rx="1" />
          <path d="M5.5 4h5M12.5 6v2.5H8V10M3.5 6v2.5H8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
