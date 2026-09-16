import { ImageResponse } from "next/og";

// Ícono de pestaña/marcador: el mismo símbolo que BrandMark en la biblioteca
// (tres nodos conectados, como un mini diagrama de flujo).
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 7,
        }}
      >
        <svg width="21" height="21" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.9">
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
