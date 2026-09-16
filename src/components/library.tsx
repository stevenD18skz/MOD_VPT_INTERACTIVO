"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { EDITABLE, PHASES, summarize } from "@/lib/flow-definition";
import { createFlow, deleteFlow, updateFlowInfo, useFlows, useStoreMode, type Flow } from "@/lib/flow-store";
import { OfflineNotice, SyncBadge } from "@/components/sync-badge";
import { ThemeToggle } from "@/components/theme-toggle";

type Summary = ReturnType<typeof summarize>;
type Item = { flow: Flow; sum: Summary };
type SortKey = "recent" | "progress" | "name";
/** "all", "done" (terminados) o el nombre de una fase. */
type FilterKey = string;
type DialogState = { mode: "create" } | { mode: "edit"; flow: Flow } | null;

/** Pasos por fase de la plantilla (igual para todos los flujos). */
const PHASE_STEPS = summarize({ nodes: {} }).phases;

const primaryBtn =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";
const ghostBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-lg border border-line bg-chrome px-3 py-1.5 text-sm text-ink transition-colors hover:border-accent";

export function Library() {
  const flows = useFlows();
  const mode = useStoreMode();
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("recent");

  const items = useMemo<Item[]>(() => (flows ?? []).map((flow) => ({ flow, sum: summarize(flow) })), [flows]);

  const q = query.trim().toLowerCase();
  const visible = items
    .filter(
      ({ flow, sum }) =>
        (!q || flow.name.toLowerCase().includes(q) || flow.description.toLowerCase().includes(q)) &&
        (filter === "all" || (filter === "done" ? sum.current === null : sum.current === filter)),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.flow.name.localeCompare(b.flow.name, "es")
        : sort === "progress"
          ? b.sum.counts.done - a.sum.counts.done
          : b.flow.updatedAt - a.flow.updatedAt,
    );

  const chips = [
    { key: "all", label: "Todos", n: items.length },
    ...PHASES.map((p) => ({ key: p.n, label: p.n, n: items.filter((i) => i.sum.current === p.n).length })),
    { key: "done", label: "Terminados", n: items.filter((i) => i.sum.current === null).length },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-chrome">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">
                Célula de Mejora Operativa · DC-1095
              </p>
              <h1 className="text-lg font-semibold leading-tight tracking-tight">Flujos de automatización</h1>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <SyncBadge />
            <ThemeToggle className={`${ghostBtn} !size-9 !p-0`} />
            <button
              type="button"
              className={primaryBtn}
              disabled={flows === null}
              onClick={() => setDialog({ mode: "create" })}
            >
              <PlusIcon /> Nuevo flujo
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {mode === "offline" ? (
          <OfflineNotice />
        ) : flows === null ? (
          <LoadingSkeleton />
        ) : flows.length === 0 ? (
          <EmptyState onCreate={() => setDialog({ mode: "create" })} />
        ) : (
          <>
            <Stats items={items} />

            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
              <label className="relative block lg:w-72">
                <span className="sr-only">Buscar flujo</span>
                <SearchIcon />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nombre o descripción…"
                  className="w-full rounded-lg border border-line bg-chrome py-2 pl-9 pr-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <div role="group" aria-label="Filtrar por fase" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5">
                {chips.map((c) => {
                  const active = filter === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setFilter(c.key)}
                      className={`shrink-0 cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "border-accent bg-accent text-white"
                          : "border-line bg-chrome text-ink hover:border-accent"
                      }`}
                    >
                      {c.label}
                      <span className={`ml-1.5 tabular-nums ${active ? "text-white/80" : "text-ink-soft"}`}>{c.n}</span>
                    </button>
                  );
                })}
              </div>
              <label className="flex items-center gap-2 text-xs text-ink-soft lg:ml-auto">
                Ordenar
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="cursor-pointer rounded-lg border border-line bg-chrome px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
                >
                  <option value="recent">Recientes</option>
                  <option value="progress">Más avance</option>
                  <option value="name">Nombre</option>
                </select>
              </label>
            </div>

            {visible.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line bg-chrome px-6 py-12 text-center">
                <p className="font-medium">Ningún flujo coincide</p>
                <p className="mt-1 text-sm text-ink-soft">Prueba con otra búsqueda o quita el filtro.</p>
                <button
                  type="button"
                  className={`${ghostBtn} mt-4`}
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Limpiar filtros
                </button>
              </div>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((i) => (
                  <FlowCard key={i.flow.id} item={i} onEdit={() => setDialog({ mode: "edit", flow: i.flow })} />
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      <FlowDialog
        state={dialog}
        onClose={() => setDialog(null)}
        onSubmit={(name, description) => {
          if (dialog?.mode === "edit") {
            updateFlowInfo(dialog.flow.id, name, description);
            setDialog(null);
          } else {
            const id = createFlow(name, description);
            setDialog(null);
            router.push(`/flujo/${id}`);
          }
        }}
      />
    </div>
  );
}

/* ================= resumen ================= */

function Stats({ items }: { items: Item[] }) {
  const finished = items.filter((i) => i.sum.current === null).length;
  const stepsDone = items.reduce((a, i) => a + i.sum.counts.done, 0);
  const stepsTotal = items.length * EDITABLE.length;
  const docsDone = items.reduce((a, i) => a + i.sum.docs.done, 0);
  const docsTotal = items.reduce((a, i) => a + i.sum.docs.total, 0);
  const byPhase = PHASES.map((p) => ({ name: p.n, n: items.filter((i) => i.sum.current === p.n).length }));
  const maxPhase = Math.max(1, ...byPhase.map((b) => b.n));

  return (
    <section aria-label="Resumen" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="Flujos" value={String(items.length)}>
        {items.length - finished} en curso · {finished} terminados
      </StatTile>
      <StatTile label="Pasos completados" value={`${pct(stepsDone, stepsTotal)}%`} bar={stepsDone / stepsTotal} color="var(--done-line)">
        {stepsDone} de {stepsTotal}
      </StatTile>
      <StatTile label="Documentos completos" value={`${pct(docsDone, docsTotal)}%`} bar={docsDone / docsTotal} color="var(--accent)">
        {docsDone} de {docsTotal}
      </StatTile>
      <div className="rounded-xl border border-line bg-chrome p-4">
        <p className="text-xs font-medium text-ink-soft">Flujos por fase</p>
        <div className="mt-2 flex h-14 items-end gap-1.5">
          {byPhase.map((b) => (
            <div key={b.name} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${b.name}: ${b.n}`}>
              <span className="text-[10px] tabular-nums text-ink-soft">{b.n}</span>
              <div
                className="w-full rounded-t bg-accent"
                style={{ height: `${Math.max(3, (b.n / maxPhase) * 30)}px`, opacity: b.n ? 0.85 : 0.2 }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1.5">
          {byPhase.map((b) => (
            <span key={b.name} className="flex-1 truncate text-center text-[9.5px] text-ink-soft" title={b.name}>
              {b.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatTile({
  label,
  value,
  bar,
  color,
  children,
}: {
  label: string;
  value: string;
  bar?: number;
  color?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-chrome p-4">
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {bar !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-chrome-2">
          <div className="h-full rounded-full" style={{ width: `${(bar || 0) * 100}%`, background: color }} />
        </div>
      )}
      <p className="mt-1.5 text-xs text-ink-soft">{children}</p>
    </div>
  );
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/* ================= tarjeta de flujo ================= */

function FlowCard({ item: { flow, sum }, onEdit }: { item: Item; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const progress = pct(sum.counts.done, sum.total);

  return (
    <li className="group relative flex flex-col rounded-2xl border border-line bg-chrome shadow-sm transition hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-md">
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          {sum.current ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent">
              <i className="size-1.5 rounded-full bg-accent" />
              {sum.current}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-done-line/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-done-line">
              ✓ Terminado
            </span>
          )}
          <div className="relative z-10 -mr-2 -mt-1 flex gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <IconButton label={`Editar ${flow.name}`} onClick={onEdit}>
              <PencilIcon />
            </IconButton>
            <IconButton label={`Eliminar ${flow.name}`} onClick={() => setConfirming(true)} danger>
              <TrashIcon />
            </IconButton>
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold leading-snug">
            <Link
              href={`/flujo/${flow.id}`}
              className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-accent"
            >
              {flow.name}
            </Link>
          </h2>
          {flow.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{flow.description}</p>
          ) : (
            <p className="mt-1 text-sm italic text-ink-soft/70">Sin descripción</p>
          )}
        </div>

        <PhaseStepper phases={sum.phases} current={sum.current} />

        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span>
              <strong className="font-semibold tabular-nums">{sum.counts.done}</strong>
              <span className="text-ink-soft"> / {sum.total} pasos</span>
            </span>
            <span className="font-semibold tabular-nums">{progress}%</span>
          </div>
          <div
            className="mt-2 flex h-2 overflow-hidden rounded-full bg-chrome-2"
            title={`${sum.counts.done} listos · ${sum.counts.test} en pruebas · ${sum.counts.prog} en progreso`}
          >
            <span style={{ width: `${(sum.counts.done / sum.total) * 100}%`, background: "var(--done-line)" }} />
            <span style={{ width: `${(sum.counts.test / sum.total) * 100}%`, background: "var(--test-line)" }} />
            <span style={{ width: `${(sum.counts.prog / sum.total) * 100}%`, background: "var(--prog-line)" }} />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Pill title="Documentos completos">
            <DocIcon /> {sum.docs.done}/{sum.docs.total} docs
          </Pill>
          <Pill title="Documentos con enlace">
            <LinkIcon /> {sum.docs.linked} enlaces
          </Pill>
          {(flow.materials?.length ?? 0) > 0 && (
            <Pill title="Material de apoyo">
              <ClipIcon /> {flow.materials!.length} material
            </Pill>
          )}
          {sum.counts.prog > 0 && <Pill dot="var(--prog-line)">{sum.counts.prog} en progreso</Pill>}
          {sum.counts.test > 0 && <Pill dot="var(--test-line)">{sum.counts.test} en pruebas</Pill>}
        </div>
      </div>

      <div className="flex min-h-12 items-center justify-between gap-2 border-t border-line px-5 py-2.5 text-xs text-ink-soft">
        {confirming ? (
          <div className="relative z-10 flex w-full items-center gap-2" role="alert">
            <span className="mr-auto font-medium text-ink">¿Eliminar este flujo?</span>
            <button type="button" className={`${ghostBtn} px-2.5 py-1 text-xs`} onClick={() => setConfirming(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-lg bg-[var(--danger)] px-2.5 py-1 text-xs font-medium text-white hover:brightness-110"
              onClick={() => deleteFlow(flow.id)}
            >
              Eliminar
            </button>
          </div>
        ) : (
          <>
            <span>Actualizado {relativeTime(flow.updatedAt)}</span>
            <span aria-hidden className="font-medium text-accent transition-transform group-hover:translate-x-0.5">
              Abrir →
            </span>
          </>
        )}
      </div>
    </li>
  );
}

function PhaseStepper({ phases, current }: { phases: Summary["phases"]; current: string | null }) {
  return (
    <ol className="flex" aria-label="Avance por fase">
      {phases.map((p, i) => {
        const complete = p.done === p.total;
        const isCurrent = p.name === current;
        const prevComplete = i > 0 && phases[i - 1].done === phases[i - 1].total;
        return (
          <li
            key={p.name}
            className="relative flex flex-1 flex-col items-center gap-1.5"
            title={`${p.name}: ${p.done}/${p.total} pasos`}
          >
            {i > 0 && (
              <span
                aria-hidden
                className={`absolute top-[9px] h-0.5 ${prevComplete ? "bg-done-line" : "bg-line"}`}
                style={{ left: "calc(-50% + 12px)", right: "calc(50% + 12px)" }}
              />
            )}
            {complete ? (
              <span className="grid size-5 place-items-center rounded-full bg-done-line text-[10px] font-bold text-white">
                ✓
              </span>
            ) : isCurrent ? (
              <span
                className="grid size-5 place-items-center rounded-full"
                style={{ background: `conic-gradient(var(--accent) ${(p.done / p.total) * 100}%, var(--line) 0)` }}
              >
                <span className="size-3 rounded-full bg-chrome" />
              </span>
            ) : (
              <span className="size-5 rounded-full border-2 border-line bg-chrome" />
            )}
            <span
              className={`max-w-full truncate text-[10px] ${isCurrent ? "font-semibold text-ink" : "text-ink-soft"}`}
            >
              {p.name}
            </span>
            <span className="sr-only">
              {complete ? "completa" : isCurrent ? "fase actual" : "pendiente"}, {p.done} de {p.total} pasos
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Pill({ children, title, dot }: { children: ReactNode; title?: string; dot?: string }) {
  return (
    <span title={title} className="inline-flex items-center gap-1 rounded-md bg-chrome-2 px-2 py-1 text-[11px] text-ink-soft">
      {dot && <i className="size-1.5 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}

function IconButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid size-8 cursor-pointer place-items-center rounded-lg text-ink-soft transition-colors hover:bg-chrome-2 ${
        danger ? "hover:text-[var(--danger)]" : "hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/* ================= estados de la página ================= */

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-chrome">
      <div className="grid gap-8 p-6 sm:p-10 md:grid-cols-[1.15fr_1fr] md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">Tu biblioteca está vacía</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Crea un flujo por cada automatización</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
            Todas siguen el mismo proceso de la célula. En cada flujo marcas el avance de los {EDITABLE.length} pasos,
            dejas notas y llevas el control de los documentos (FT-769, historia de usuario, matriz de pruebas…).
          </p>
          <button type="button" className={`${primaryBtn} mt-5`} onClick={onCreate}>
            <PlusIcon /> Crear mi primer flujo
          </button>
        </div>
        <ol className="space-y-2">
          {PHASE_STEPS.map((p, i) => (
            <li key={p.name} className="flex items-center gap-3 rounded-lg border border-line bg-chrome-2 px-3 py-2.5">
              <span className="grid size-6 place-items-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                {i + 1}
              </span>
              <span className="text-sm font-medium">{p.name}</span>
              <span className="ml-auto text-xs tabular-nums text-ink-soft">{p.total} pasos</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div aria-hidden>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-line bg-chrome" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-72 animate-pulse rounded-2xl border border-line bg-chrome" />
        ))}
      </div>
    </div>
  );
}

/* ================= diálogo crear / editar ================= */

function FlowDialog({
  state,
  onClose,
  onSubmit,
}: {
  state: DialogState;
  onClose: () => void;
  onSubmit: (name: string, description: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (state && !d.open) d.showModal();
    else if (!state && d.open) d.close();
  }, [state]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto w-[min(92vw,480px)] rounded-2xl border border-line bg-chrome p-0 text-ink shadow-2xl backdrop:bg-black/50"
    >
      {state && (
        <FlowForm
          key={state.mode === "edit" ? state.flow.id : "nuevo"}
          initial={state.mode === "edit" ? state.flow : undefined}
          onSubmit={onSubmit}
          onCancel={onClose}
        />
      )}
    </dialog>
  );
}

function FlowForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: { name: string; description: string };
  onSubmit: (name: string, description: string) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const field =
    "w-full rounded-lg border border-line bg-chrome-2 px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit(name.trim(), description.trim());
      }}
      className="flex flex-col gap-4 p-6"
    >
      <div>
        <h2 className="text-lg font-semibold">{initial ? "Editar flujo" : "Nuevo flujo"}</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {initial
            ? "Cambia el nombre o la descripción de la automatización."
            : "Se crea con los 5 pasos del proceso: Análisis, Diseño, Desarrollo, Pruebas y Despliegue."}
        </p>
      </div>
      <div>
        <label htmlFor={`${id}-name`} className="mb-1.5 block text-xs font-medium text-ink-soft">
          Nombre de la automatización
        </label>
        <input
          id={`${id}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Conciliación bancaria automática"
          maxLength={200}
          className={field}
        />
      </div>
      <div>
        <label htmlFor={`${id}-desc`} className="mb-1.5 block text-xs font-medium text-ink-soft">
          Descripción <span className="font-normal">(opcional)</span>
        </label>
        <textarea
          id={`${id}-desc`}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Proceso, área solicitante, líder…"
          maxLength={2000}
          className={`${field} resize-y`}
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className={ghostBtn}>
          Cancelar
        </button>
        <button type="submit" disabled={!name.trim()} className={primaryBtn}>
          {initial ? "Guardar cambios" : "Crear y abrir"}
        </button>
      </div>
    </form>
  );
}

/* ================= iconos ================= */

const svgProps = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function BrandMark() {
  return (
    <span className="grid size-9 place-items-center rounded-xl bg-accent text-white shadow-sm">
      <svg {...svgProps} width="18" height="18" strokeWidth={1.8}>
        <rect x="1.5" y="2" width="4" height="4" rx="1" />
        <rect x="10.5" y="2" width="4" height="4" rx="1" />
        <rect x="6" y="10" width="4" height="4" rx="1" />
        <path d="M5.5 4h5M12.5 6v2.5H8V10M3.5 6v2.5H8" />
      </svg>
    </span>
  );
}

function PlusIcon() {
  return (
    <svg {...svgProps} width="14" height="14" strokeWidth={2}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      {...svgProps}
      width="16"
      height="16"
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg {...svgProps} width="15" height="15">
      <path d="M10.5 2.5 13.5 5.5 6 13H3v-3z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg {...svgProps} width="15" height="15">
      <path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 9h6.6l.7-9" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg {...svgProps} width="12" height="12">
      <path d="M4 1.5h5.5l3 3v10h-8.5z" />
      <path d="M9.5 1.5v3h3" />
    </svg>
  );
}

function ClipIcon() {
  return (
    <svg {...svgProps} width="12" height="12">
      <path d="M13 7.5 8 12.5a3.2 3.2 0 0 1-4.5-4.5l5.3-5.3a2.1 2.1 0 0 1 3 3L6.5 11a1.1 1.1 0 0 1-1.5-1.5L10 4.5" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg {...svgProps} width="12" height="12">
      <path d="M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1" />
    </svg>
  );
}

/* ================= utilidades ================= */

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
