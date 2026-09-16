import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Flujos de Automatización · Célula de Mejora Operativa",
    short_name: "Flujos",
    description: "Biblioteca de flujos de automatización: avance de pasos, documentos y material de apoyo.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f5f7",
    theme_color: "#2e75b6",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
