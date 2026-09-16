import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://flujointeractivo.vercel.app";
const DESCRIPTION =
  "Biblioteca de flujos de automatización de la Célula de Mejora Operativa: sigue el avance de cada paso, documento y material de apoyo.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Flujos de Automatización",
    template: "%s · Flujos de Automatización",
  },
  description: DESCRIPTION,
  applicationName: "Flujos de Automatización",
  // Herramienta interna sin inicio de sesión todavía: fuera de buscadores por ahora
  // (ver también app/robots.ts, que bloquea el rastreo además del indexado).
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    title: "Flujos de Automatización",
    description: DESCRIPTION,
    siteName: "Flujos de Automatización",
  },
  twitter: {
    card: "summary_large_image",
    title: "Flujos de Automatización",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#14171c" },
  ],
};

// Debe coincidir con THEME_KEY en src/lib/theme.ts (no se puede importar aquí:
// ese módulo es "use client" y este script corre antes de que exista React).
const THEME_INIT = `(function(){try{var t=localStorage.getItem("flujo-interactivo:theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Aplica el tema guardado antes del primer pintado, para que no haya parpadeo. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
