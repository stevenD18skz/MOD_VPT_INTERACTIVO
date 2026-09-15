"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { EDITABLE, PHASES, STATUSES, summarize } from "@/lib/flow-definition";
import { createFlow, deleteFlow, updateFlowInfo, useFlows, useStoreMode, type Flow } from "@/lib/flow-store";
import { OfflineNotice, SyncBadge } from "@/components/sync-badge";

export function Library() {
  const flows = useFlows();
  const mode = useStoreMode();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const visible = flows
    ?.filter((f) => !q || f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">
            Célula de Mejora Operativa · DC-1095
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Biblioteca de flujos</h1>
          <p className="mt-1 max-w-xl text-sm text-ink-soft">
            Cada automatización sigue el mismo flujo ({PHASES.map((p) => p.n).join(" → ")}) con{" "}
            {EDITABLE.length} pasos. Abre un flujo para marcar el estado de cada paso y dejar notas.
          </p>
          <div className="mt-2 min-h-4">
            <SyncBadge />
          </div>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            disabled={flows === null}
            className="cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Nuevo flujo
          </button>
        )}
      </header>

      {creating && (
        <div className="mb-6 max-w-xl">
          <FlowForm
            title="Nuevo flujo"
            submitLabel="Crear y abrir"
            onCancel={() => setCreating(false)}
            onSubmit={(name, description) => router.push(`/flujo/${createFlow(name, description)}`)}
          />
        </div>
      )}

      {mode === "offline" ? (
        <OfflineNotice />
      ) : visible === undefined ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-52 animate-pulse rounded-xl border border-line bg-chrome" />
          ))}
        </ul>
      ) : flows!.length === 0 ? (
        !creating && (
          <div className="rounded-xl border border-dashed border-line bg-chrome px-6 py-14 text-center">
            <p className="font-medium">Aún no tienes flujos</p>
            <p className="mt-1 text-sm text-ink-soft">
              Crea uno por cada automatización que estés trabajando.
            </p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-4 cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              + Crear el primero
            </button>
          </div>
        )
      ) : (
        <>
          {flows!.length > 3 && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar flujo…"
              className="mb-4 w-full max-w-sm rounded-lg border border-line bg-chrome px-3 py-2 text-sm outline-none focus:border-accent"
            />
          )}
          {visible.length === 0 ? (
            <p className="text-sm text-ink-soft">Ningún flujo coincide con “{query}”.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((f) => (
                <FlowCard key={f.id} flow={f} />
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}

function FlowCard({ flow }: { flow: Flow }) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const sum = summarize(flow.nodes, flow.links);
  const pct = Math.round((sum.counts.done / sum.total) * 100);

  if (mode === "edit") {
    return (
      <li>
        <FlowForm
          title="Editar flujo"
          initial={flow}
          submitLabel="Guardar"
          onCancel={() => setMode("view")}
          onSubmit={(name, description) => {
            updateFlowInfo(flow.id, name, description);
            setMode("view");
          }}
        />
      </li>
    );
  }

  return (
    <li className="relative flex flex-col gap-4 rounded-xl border border-line bg-chrome p-4 transition-colors hover:border-accent">
      <div>
        <h2 className="font-semibold leading-snug">
          <Link
            href={`/flujo/${flow.id}`}
            className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-accent"
          >
            {flow.name}
          </Link>
        </h2>
        {flow.description && (
          <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{flow.description}</p>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between text-xs">
          {sum.current ? (
            <span className="text-ink-soft">
              Fase actual: <strong className="font-medium text-ink">{sum.current}</strong>
            </span>
          ) : (
            <strong className="font-medium text-done-line">Completado</strong>
          )}
          <span className="tabular-nums text-ink-soft">
            {sum.counts.done}/{sum.total} · {pct}%
          </span>
        </div>
        <div className="mt-2 grid grid-cols-5 gap-1">
          {sum.phases.map((p) => (
            <div key={p.name} title={`${p.name}: ${p.done}/${p.total}`}>
              <div className="h-1.5 overflow-hidden rounded-full bg-chrome-2">
                <div
                  className="h-full rounded-full bg-done-line"
                  style={{ width: `${(p.done / p.total) * 100}%` }}
                />
              </div>
              <div className="mt-1 truncate text-[10px] text-ink-soft">{p.name}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
        {STATUSES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <i className="size-2 rounded-full" style={{ background: `var(--${s.key}-line)` }} />
            {s.label} <span className="tabular-nums text-ink">{sum.counts[s.key]}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5" title="Documentos del flujo que ya tienen enlace">
          <span className="text-accent">↗</span> Docs con enlace{" "}
          <span className="tabular-nums text-ink">
            {sum.docs.linked}/{sum.docs.total}
          </span>
        </span>
      </div>

      <div className="relative z-10 mt-auto flex items-center justify-between gap-2 border-t border-line pt-3 text-xs">
        <span className="text-ink-soft">Actualizado {relativeTime(flow.updatedAt)}</span>
        {mode === "confirm" ? (
          <span className="flex items-center gap-1">
            <span className="mr-1">¿Eliminar?</span>
            <button
              type="button"
              onClick={() => deleteFlow(flow.id)}
              className="cursor-pointer rounded-md bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700"
            >
              Sí
            </button>
            <button type="button" onClick={() => setMode("view")} className={ghostBtn}>
              No
            </button>
          </span>
        ) : (
          <span className="flex gap-1">
            <button type="button" onClick={() => setMode("edit")} className={ghostBtn}>
              Editar
            </button>
            <button type="button" onClick={() => setMode("confirm")} className={ghostBtn}>
              Eliminar
            </button>
          </span>
        )}
      </div>
    </li>
  );
}

const ghostBtn =
  "cursor-pointer rounded-md border border-line bg-chrome-2 px-2 py-1 text-ink hover:border-accent";

function FlowForm({
  title,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  title: string;
  initial?: { name: string; description: string };
  submitLabel: string;
  onSubmit: (name: string, description: string) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const field =
    "w-full rounded-lg border border-line bg-chrome-2 px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit(name.trim(), description.trim());
      }}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      className="flex flex-col gap-3 rounded-xl border border-accent bg-chrome p-4"
    >
      <p className="font-semibold">{title}</p>
      <div>
        <label htmlFor={`${id}-name`} className="mb-1 block text-xs font-medium text-ink-soft">
          Nombre de la automatización
        </label>
        <input
          id={`${id}-name`}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Conciliación bancaria automática"
          className={field}
        />
      </div>
      <div>
        <label htmlFor={`${id}-desc`} className="mb-1 block text-xs font-medium text-ink-soft">
          Descripción <span className="font-normal">(opcional)</span>
        </label>
        <textarea
          id={`${id}-desc`}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Proceso, área solicitante, líder…"
          className={`${field} resize-y`}
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={`${ghostBtn} px-3 py-1.5 text-sm`}>
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!name.trim()}
          className="cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

function relativeTime(ts: number) {
  const diff = (ts - Date.now()) / 1000;
  for (const [unit, secs] of UNITS) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return "hace un momento";
}
