"use client";

// Tema claro/oscuro elegido a mano, independiente del sistema operativo o el navegador.
// Antes de que el usuario elija uno, sigue la preferencia del sistema como punto de
// partida; en cuanto lo cambia con el botón, esa elección queda fija (ver [[layout]]
// para el script en línea que evita el parpadeo del tema incorrecto al cargar).

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

/** Debe coincidir con la clave que usa el script en línea de app/layout.tsx. */
export const THEME_KEY = "flujo-interactivo:theme";

const listeners = new Set<() => void>();
let theme: Theme = "light";
let started = false;

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function start() {
  if (started) return;
  started = true;
  theme = readStored() ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Theme {
  start();
  return theme;
}

/** Tema activo. En el servidor (y hasta que React hidrata) se asume "light". */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, () => "light");
}

export function setTheme(next: Theme) {
  theme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {}
  document.documentElement.setAttribute("data-theme", next);
  listeners.forEach((l) => l());
}

export function toggleTheme() {
  setTheme(getSnapshot() === "dark" ? "light" : "dark");
}
