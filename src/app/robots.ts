import type { MetadataRoute } from "next";

// Herramienta interna sin inicio de sesión todavía: se pide a los buscadores que no
// la indexen ni la rastreen (ver también `robots` en layout.tsx, que cubre páginas
// ya enlazadas desde otro sitio).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
