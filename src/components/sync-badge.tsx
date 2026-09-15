"use client";

import { retry, useStoreMode, useSyncState } from "@/lib/flow-store";

/** Indicador de dónde y cómo se están guardando los flujos. */
export function SyncBadge() {
  const mode = useStoreMode();
  const sync = useSyncState();
  if (mode === "loading" || mode === "offline") return null;

  if (mode === "remote" && sync === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--danger)]" role="alert">
        <i className="size-2 rounded-full bg-[var(--danger)]" />
        No se pudo guardar un cambio
        <button type="button" onClick={retry} className="cursor-pointer underline underline-offset-2">
          Recargar
        </button>
      </span>
    );
  }

  const [color, label, title] =
    mode === "local"
      ? ["var(--prog-line)", "Solo en este navegador", "Configura Turso (.env) para guardar en la nube"]
      : sync === "saving"
        ? ["var(--accent)", "Guardando…", "Enviando cambios a la base de datos"]
        : ["var(--done-line)", "Guardado en la nube", "Todos los cambios están en Turso"];

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-soft" role="status" title={title}>
      <i className={`size-2 rounded-full ${sync === "saving" ? "animate-pulse" : ""}`} style={{ background: color }} />
      {label}
    </span>
  );
}

/** Pantalla para cuando no se pudo leer la base de datos. */
export function OfflineNotice() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-line bg-chrome px-6 py-10 text-center">
      <p className="font-medium">No se pudo conectar con la base de datos</p>
      <p className="text-sm text-ink-soft">Revisa tu conexión o la configuración de Turso e inténtalo de nuevo.</p>
      <button
        type="button"
        onClick={retry}
        className="cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Reintentar
      </button>
    </div>
  );
}
