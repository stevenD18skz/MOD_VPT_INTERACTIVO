"use client";

import { useLayoutEffect } from "react";
import { THEME_KEY, toggleTheme, useTheme } from "@/lib/theme";

/**
 * Botón global para fijar el tema claro/oscuro (no depende del navegador).
 * Muestra el ícono del tema al que cambiaría al hacer clic.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();

  // El script en línea de app/layout.tsx ya pone el atributo antes del primer pintado;
  // esto solo lo restaura si React lo limpia al remontar en modo desarrollo (Strict Mode).
  useLayoutEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === "light" || stored === "dark") document.documentElement.setAttribute("data-theme", stored);
    } catch {}
  }, []);

  return (
    <button
      type="button"
      className={className}
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={theme === "dark" ? "Tema claro" : "Tema oscuro"}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <circle cx="8" cy="8" r="3.2" />
      <path d="M8 1.3v1.6M8 13.1v1.6M2.6 8H1M15 8h-1.6M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M3.5 12.5l1.1-1.1M11.4 4.6l1.1-1.1" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13.7 9.7A5.6 5.6 0 0 1 6.3 2.3a5.8 5.8 0 1 0 7.4 7.4z" />
    </svg>
  );
}
