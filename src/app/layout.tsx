import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Flujos de Automatización",
  description: "Biblioteca de flujos de automatización · Célula de Mejora Operativa",
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
