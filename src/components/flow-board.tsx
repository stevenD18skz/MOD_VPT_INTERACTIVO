"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import styles from "./flow-board.module.css";
import {
  ARTIFACTS,
  ASSOCIATIONS,
  BY_ID,
  DOC_KEYS,
  EDGES,
  EDITABLE,
  GW,
  H,
  HEAD_W,
  KR,
  ER,
  LANES,
  LANE_X0,
  LANE_X1,
  NODES,
  PHASES,
  POOL_W,
  STATUSES,
  W,
  dims,
  docsForStep,
  normalizeUrl,
  stepsForDoc,
  laneOf,
  phaseOf,
  route,
  wrapWords,
  type FlowNode,
  type NodeState,
} from "@/lib/flow-definition";
import { setDocLink, setNodeNote, setNodeStatus, useFlows, useStoreMode, type Flow } from "@/lib/flow-store";
import { OfflineNotice, SyncBadge } from "./sync-badge";

export function FlowBoard({ id }: { id: string }) {
  const flows = useFlows();
  const mode = useStoreMode();
  if (flows === null) {
    return <div className={styles.center}>{mode === "offline" ? <OfflineNotice /> : "Cargando…"}</div>;
  }
  const flow = flows.find((f) => f.id === id);
  if (!flow) {
    return (
      <div className={styles.center}>
        <p>Este flujo no existe o fue eliminado.</p>
        <Link href="/" className={styles.back}>
          ← Volver a la biblioteca
        </Link>
      </div>
    );
  }
  return <Board flow={flow} />;
}

function Board({ flow }: { flow: Flow }) {
  const vpRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const nodeEls = useRef<Record<string, HTMLElement | null>>({});
  const scaleRef = useRef(1);
  const openIdRef = useRef<string | null>(null);
  const pan = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const panMoved = useRef(false);

  const [zoom, setZoom] = useState(100);
  const [panning, setPanning] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  /* ---------- popover placement ---------- */
  const place = useCallback(() => {
    const id = openIdRef.current;
    const pop = popRef.current;
    const el = id ? nodeEls.current[id] : null;
    if (!pop || !el) return;
    const r = el.getBoundingClientRect();
    const pw = pop.offsetWidth || 330;
    const ph = pop.offsetHeight || 330;
    let left = r.left;
    let top = r.bottom + 8;
    if (left + pw > window.innerWidth - 10) left = window.innerWidth - pw - 10;
    if (left < 10) left = 10;
    if (top + ph > window.innerHeight - 10) top = Math.max(10, r.top - ph - 8);
    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }, []);

  useLayoutEffect(() => {
    openIdRef.current = openId;
    place();
  }, [openId, place]);

  /* ---------- zoom ---------- */
  const applyScale = useCallback(
    (s: number) => {
      scaleRef.current = s;
      if (stageRef.current) stageRef.current.style.transform = `scale(${s})`;
      if (sizerRef.current) {
        sizerRef.current.style.width = W * s + "px";
        sizerRef.current.style.height = H * s + "px";
      }
      setZoom(Math.round(s * 100));
      place();
    },
    [place],
  );

  const fitHeight = useCallback(() => {
    const vp = vpRef.current;
    if (!vp) return;
    applyScale(Math.max(0.05, (vp.clientHeight - 16) / H));
    vp.scrollLeft = 0;
    vp.scrollTop = 0;
  }, [applyScale]);

  const zoomAt = useCallback(
    (f: number, cx: number, cy: number) => {
      const vp = vpRef.current;
      if (!vp) return;
      const old = scaleRef.current;
      const s = Math.min(3, Math.max(0.05, old * f));
      const r = vp.getBoundingClientRect();
      const px = (vp.scrollLeft + (cx - r.left)) / old;
      const py = (vp.scrollTop + (cy - r.top)) / old;
      applyScale(s);
      vp.scrollLeft = px * s - (cx - r.left);
      vp.scrollTop = py * s - (cy - r.top);
    },
    [applyScale],
  );

  const zoomCenter = (f: number) => {
    const r = vpRef.current?.getBoundingClientRect();
    if (r) zoomAt(f, r.left + r.width / 2, r.top + r.height / 2);
  };

  useLayoutEffect(() => {
    fitHeight();
    const t = setTimeout(fitHeight, 60);
    return () => clearTimeout(t);
  }, [fitHeight]);

  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.1 : 0.9, e.clientX, e.clientY);
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    vp.addEventListener("scroll", place);
    window.addEventListener("resize", place);
    return () => {
      vp.removeEventListener("wheel", onWheel);
      vp.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [zoomAt, place]);

  /* ---------- close popover ---------- */
  useEffect(() => {
    if (!openId) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element;
      if (panMoved.current || popRef.current?.contains(t) || t.closest?.("[data-node]")) return;
      setOpenId(null);
    };
    // React escucha en `document` (App Router), así que un Escape ya atendido
    // dentro del popover llega aquí marcado con preventDefault.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && setOpenId(null);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [openId]);

  // Re-ubica el popover cuando cambia de tamaño (p. ej. al abrir el formulario de enlace).
  useEffect(() => {
    const pop = popRef.current;
    if (!openId || !pop) return;
    const ro = new ResizeObserver(place);
    ro.observe(pop);
    return () => ro.disconnect();
  }, [openId, place]);

  const links = flow.links ?? NO_LINKS;
  const linked = useMemo(() => new Set(Object.keys(links)), [links]);
  const done = EDITABLE.filter((n) => flow.nodes[n.id]?.s === "done").length;
  const docsLinked = DOC_KEYS.filter((k) => links[k]).length;
  const openNode = openId ? BY_ID[openId] : null;
  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id));

  return (
    <div className={styles.root}>
      <header className={styles.bar}>
        <Link href="/" className={styles.back}>
          ← Biblioteca
        </Link>
        <div className={styles.title}>
          <h1>{flow.name}</h1>
          <span className={styles.sub}>Flujo de Automatización · DC-1095</span>
        </div>
        <div className={styles.grp}>
          <button type="button" className={styles.tb} onClick={() => zoomCenter(0.8)} aria-label="Alejar">
            −
          </button>
          <span className={styles.zoomval}>{zoom}%</span>
          <button type="button" className={styles.tb} onClick={() => zoomCenter(1.25)} aria-label="Acercar">
            +
          </button>
          <button type="button" className={styles.tb} onClick={fitHeight}>
            Ajustar alto
          </button>
        </div>
        <div className={styles.legend}>
          {STATUSES.map((s) => (
            <span key={s.key} className={styles.lg}>
              <i
                className={styles.sw}
                style={{ background: `var(--${s.key}-fill)`, borderColor: `var(--${s.key}-line)` }}
              />
              {s.label}
            </span>
          ))}
        </div>
        <div className={styles.spacer} />
        <SyncBadge />
        <span className={styles.progress}>
          {done} / {EDITABLE.length} listas · {docsLinked} / {DOC_KEYS.length} docs con enlace
        </span>
      </header>

      <div
        ref={vpRef}
        className={`${styles.viewport} ${panning ? styles.panning : ""}`}
        onPointerDown={(e) => {
          panMoved.current = false;
          if ((e.target as Element).closest("[data-node]")) return;
          const vp = e.currentTarget;
          pan.current = { x: e.clientX, y: e.clientY, l: vp.scrollLeft, t: vp.scrollTop };
          setPanning(true);
          vp.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const p = pan.current;
          if (!p) return;
          const dx = e.clientX - p.x;
          const dy = e.clientY - p.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) panMoved.current = true;
          e.currentTarget.scrollLeft = p.l - dx;
          e.currentTarget.scrollTop = p.t - dy;
        }}
        onPointerUp={() => {
          pan.current = null;
          setPanning(false);
        }}
        onPointerCancel={() => {
          pan.current = null;
          setPanning(false);
        }}
      >
        <div ref={sizerRef} className={styles.sizer}>
          <div ref={stageRef} className={styles.stage} style={{ width: W, height: H }}>
            <div className={styles.paper} />
            <Diagram linked={linked} />
            {EDITABLE.map((n) => (
              <StepNode
                key={n.id}
                node={n}
                state={flow.nodes[n.id]}
                selected={openId === n.id}
                nodeRef={(el) => {
                  nodeEls.current[n.id] = el;
                }}
                onClick={() => toggle(n.id)}
              />
            ))}
            {ARTIFACTS.map((n) => (
              <ArtifactNode
                key={n.id}
                node={n}
                url={links[n.l]}
                selected={openId === n.id}
                nodeRef={(el) => {
                  nodeEls.current[n.id] = el;
                }}
                onEdit={() => toggle(n.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {openNode && (
        <div
          ref={popRef}
          className={styles.pop}
          role="dialog"
          aria-label={isDoc(openNode) ? "Enlace del documento" : "Editar paso"}
        >
          {isDoc(openNode) ? (
            <DocPanel
              key={openNode.id}
              flowId={flow.id}
              node={openNode}
              url={links[openNode.l]}
              onClose={() => setOpenId(null)}
            />
          ) : (
            <StepEditor
              key={openNode.id}
              flowId={flow.id}
              node={openNode}
              state={flow.nodes[openNode.id] ?? {}}
              links={links}
              onClose={() => setOpenId(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ================= editable node ================= */
function StepNode({
  node,
  state,
  selected,
  nodeRef,
  onClick,
}: {
  node: FlowNode;
  state: NodeState | undefined;
  selected: boolean;
  nodeRef: (el: HTMLButtonElement | null) => void;
  onClick: () => void;
}) {
  const d = dims(node);
  return (
    <button
      type="button"
      ref={nodeRef}
      data-node
      data-st={state?.s ?? "todo"}
      className={`${styles.node} ${selected ? styles.sel : ""}`}
      style={{
        left: node.x - d.w / 2,
        top: node.y - d.h / 2,
        width: d.w,
        height: d.h,
        borderWidth: node.t === "s" ? 2.6 : undefined,
      }}
      onClick={onClick}
    >
      <span className={styles.txt}>{node.l}</span>
      <i className={styles.badge} />
      {state?.n?.trim() && <i className={styles.noteflag}>✎</i>}
    </button>
  );
}

/* ================= popover body ================= */
function StepEditor({
  flowId,
  node,
  state,
  links,
  onClose,
}: {
  flowId: string;
  node: FlowNode;
  state: NodeState;
  links: Record<string, string>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(state.n ?? "");
  const [saved, setSaved] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<string | null>(null);
  const status = state.s ?? "todo";
  const docs = docsForStep(node.id);

  // Guarda la nota pendiente si se cierra el popover antes del debounce.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (pending.current !== null) setNodeNote(flowId, node.id, pending.current);
    },
    [flowId, node.id],
  );

  useEffect(() => {
    if (saved !== "Guardado") return;
    const t = setTimeout(() => setSaved(""), 1400);
    return () => clearTimeout(t);
  }, [saved]);

  const urls = (draft.match(/https?:\/\/[^\s<>"')]+/g) ?? []).slice(0, 8);

  return (
    <>
      <p className={styles.ttl}>{node.l}</p>
      <div className={styles.crumb}>
        {phaseOf(node.x)} · {laneOf(node.y)}
      </div>
      <p className={styles.lbl}>Estado</p>
      <div className={styles.states}>
        {STATUSES.map((s) => (
          <button
            key={s.key}
            type="button"
            className={styles.st}
            data-s={s.key}
            aria-pressed={status === s.key}
            onClick={() => {
              setNodeStatus(flowId, node.id, s.key);
              setSaved("Guardado");
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      {docs.length > 0 && (
        <>
          <p className={styles.lbl}>Documentos</p>
          <div className={styles.docs}>
            {docs.map((d) => (
              <DocLinkRow key={d.id} flowId={flowId} doc={d} url={links[d.l]} />
            ))}
          </div>
        </>
      )}
      <p className={styles.lbl}>Comentarios y enlaces</p>
      <textarea
        className={styles.notes}
        value={draft}
        placeholder="Notas, acuerdos, pendientes, enlaces (pega URLs y aparecen abajo)…"
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          setSaved("Guardando…");
          pending.current = v;
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            pending.current = null;
            setNodeNote(flowId, node.id, v);
            setSaved("Guardado");
          }, 450);
        }}
      />
      {urls.length > 0 && (
        <div className={styles.links}>
          {urls.map((u, i) => (
            <a key={i} href={u} target="_blank" rel="noopener noreferrer">
              ↗ {u.length > 46 ? u.slice(0, 46) + "…" : u}
            </a>
          ))}
        </div>
      )}
      <div className={styles.foot}>
        <span className={styles.saved}>{saved}</span>
        <button type="button" className={styles.tb} onClick={onClose}>
          Cerrar
        </button>
      </div>
    </>
  );
}

/* ================= documentos con enlace ================= */
const NO_LINKS: Record<string, string> = {};

const isDoc = (n: FlowNode) => n.t === "d" || n.t === "b";

/** Zona clicable sobre un documento del diagrama: abre su enlace o permite agregarlo. */
function ArtifactNode({
  node,
  url,
  selected,
  nodeRef,
  onEdit,
}: {
  node: FlowNode;
  url: string | undefined;
  selected: boolean;
  nodeRef: (el: HTMLDivElement | null) => void;
  onEdit: () => void;
}) {
  const d = dims(node);
  return (
    <div
      ref={nodeRef}
      data-node
      className={`${styles.art} ${url ? styles.artLinked : ""} ${selected ? styles.artSel : ""}`}
      style={{ left: node.x - d.w / 2, top: node.y - d.h / 2, width: d.w, height: d.h }}
    >
      {url ? (
        <>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.artHit}
            title={`Abrir en nueva pestaña: ${url}`}
            aria-label={`Abrir ${node.l} en una nueva pestaña`}
          >
            <span className={styles.artIcon} aria-hidden>
              ↗
            </span>
          </a>
          <button
            type="button"
            className={styles.artEdit}
            onClick={onEdit}
            title="Editar enlace"
            aria-label={`Editar enlace de ${node.l}`}
          >
            ✎
          </button>
        </>
      ) : (
        <button
          type="button"
          className={styles.artHit}
          onClick={onEdit}
          title="Agregar enlace"
          aria-label={`Agregar enlace a ${node.l}`}
        >
          <span className={styles.artIcon} aria-hidden>
            +
          </span>
        </button>
      )}
    </div>
  );
}

/** Mensaje de confirmación que se borra solo. */
function useFlash(ms = 1800) {
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), ms);
    return () => clearTimeout(t);
  }, [msg, ms]);
  return [msg, setMsg] as const;
}

/** Popover de un documento: abrir, agregar, editar o quitar su enlace. */
function DocPanel({
  flowId,
  node,
  url,
  onClose,
}: {
  flowId: string;
  node: FlowNode;
  url: string | undefined;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(!url);
  const [flash, setFlash] = useFlash();
  const steps = stepsForDoc(node.l);
  const places = ARTIFACTS.filter((a) => a.l === node.l).length;

  return (
    <>
      <p className={styles.ttl}>{node.l}</p>
      <div className={styles.crumb}>
        {node.t === "d" ? "Documento" : "Sistema / repositorio"} · {phaseOf(node.x)}
      </div>
      {steps.length > 0 && (
        <>
          <p className={styles.lbl}>Se usa en</p>
          <ul className={styles.usedIn}>
            {steps.map((s) => (
              <li key={s.id}>{s.l}</li>
            ))}
          </ul>
        </>
      )}
      <p className={styles.lbl}>Enlace</p>
      {url && !editing ? (
        <>
          <a href={url} target="_blank" rel="noopener noreferrer" className={styles.openBtn}>
            Abrir en nueva pestaña ↗
          </a>
          <p className={styles.urlLine} title={url}>
            {url}
          </p>
        </>
      ) : (
        <DocLinkForm
          key={url ?? "nuevo"}
          initial={url}
          onSave={(u) => {
            setDocLink(flowId, node.l, u);
            setEditing(false);
            setFlash(url ? "Enlace actualizado" : "Enlace guardado");
          }}
          onRemove={
            url
              ? () => {
                  setDocLink(flowId, node.l, null);
                  setFlash("Enlace eliminado");
                }
              : undefined
          }
          onCancel={url ? () => setEditing(false) : undefined}
        />
      )}
      {places > 1 && (
        <p className={styles.hint}>
          Este documento aparece en {places} lugares del flujo; el enlace se comparte entre todos.
        </p>
      )}
      <div className={styles.foot}>
        <span className={`${styles.saved} ${flash ? styles.ok : ""}`} role="status">
          {flash && `✓ ${flash}`}
        </span>
        <span className={styles.grp}>
          {url && !editing && (
            <button type="button" className={styles.tb} onClick={() => setEditing(true)}>
              Editar enlace
            </button>
          )}
          <button type="button" className={styles.tb} onClick={onClose}>
            Cerrar
          </button>
        </span>
      </div>
    </>
  );
}

/** Fila de un documento dentro del popover de un paso. */
function DocLinkRow({ flowId, doc, url }: { flowId: string; doc: FlowNode; url: string | undefined }) {
  const [editing, setEditing] = useState(false);
  const [flash, setFlash] = useFlash();

  return (
    <div className={styles.docItem}>
      <div className={styles.docRow}>
        <span className={`${styles.docDot} ${url ? styles.docDotOn : ""}`} aria-hidden />
        <span className={styles.docName} title={doc.l}>
          {doc.l}
        </span>
        {flash ? (
          <span className={styles.ok} role="status">
            ✓ {flash}
          </span>
        ) : (
          !editing && (
            <>
              {url && (
                <a href={url} target="_blank" rel="noopener noreferrer" className={styles.docOpen}>
                  Abrir ↗
                </a>
              )}
              <button type="button" className={styles.docAction} onClick={() => setEditing(true)}>
                {url ? "Editar" : "+ Enlace"}
              </button>
            </>
          )
        )}
      </div>
      {editing && (
        <DocLinkForm
          initial={url}
          onSave={(u) => {
            setDocLink(flowId, doc.l, u);
            setEditing(false);
            setFlash(url ? "Actualizado" : "Guardado");
          }}
          onRemove={
            url
              ? () => {
                  setDocLink(flowId, doc.l, null);
                  setEditing(false);
                  setFlash("Eliminado");
                }
              : undefined
          }
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function DocLinkForm({
  initial,
  onSave,
  onRemove,
  onCancel,
}: {
  initial?: string;
  onSave: (url: string) => void;
  onRemove?: () => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(initial ?? "");
  const [error, setError] = useState("");

  return (
    <form
      className={styles.linkForm}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const url = normalizeUrl(value);
        if (!url) {
          setError(
            value.trim()
              ? "Ese enlace no es válido. Usa una dirección web (https://…)."
              : "Pega o escribe un enlace.",
          );
          return;
        }
        onSave(url);
      }}
      onKeyDown={(e) => {
        // Escape cancela la edición sin cerrar todo el popover.
        if (e.key === "Escape" && onCancel) {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <input
        autoFocus
        type="text"
        inputMode="url"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError("");
        }}
        placeholder="https://… (SharePoint, Drive, Outlook…)"
        className={styles.linkInput}
        aria-invalid={!!error}
        aria-label="Enlace del documento"
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.linkActions}>
        {onRemove && (
          <button type="button" className={styles.danger} onClick={onRemove}>
            Quitar enlace
          </button>
        )}
        <span className={styles.spacer} />
        {onCancel && (
          <button type="button" className={styles.tb} onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button type="submit" className={styles.primary}>
          Guardar
        </button>
      </div>
    </form>
  );
}

/* ================= static diagram (lanes, phases, edges, artifacts) ================= */
const soft = { fill: "var(--ink-soft)" };

const Diagram = memo(function Diagram({ linked }: { linked: Set<string> }) {
  const poolTop = LANES[0].y0;
  const poolBot = LANES[LANES.length - 1].y1;
  const headTop = 563;
  const headBot = 2500;
  const poolCx = LANE_X0 + POOL_W / 2;
  const poolCy = (headTop + headBot) / 2;

  return (
    <svg className={styles.wires} width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <defs>
        <marker
          id="ar"
          markerWidth={9}
          markerHeight={9}
          refX={8}
          refY={3.2}
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L8,3.2 L0,6.4 z" style={{ fill: "var(--flow)" }} />
        </marker>
      </defs>

      {/* phases + pool + lanes */}
      <g>
        {PHASES.map((p, i) => (
          <g key={p.n}>
            {i > 0 && (
              <line
                x1={p.x0}
                y1={0}
                x2={p.x0}
                y2={H}
                style={{ stroke: "var(--phase-line)" }}
                strokeWidth={2}
                strokeDasharray="14 9"
              />
            )}
            <text x={(p.x0 + p.x1) / 2} y={34} textAnchor="middle" fontSize={22} fontWeight={700} style={soft}>
              {p.n}
            </text>
          </g>
        ))}
        <line x1={LANE_X0} y1={60} x2={LANE_X1} y2={60} style={{ stroke: "var(--lane-line)" }} strokeWidth={2} />
        <rect
          x={LANE_X0}
          y={poolTop}
          width={LANE_X1 - LANE_X0}
          height={poolBot - poolTop}
          fill="none"
          style={{ stroke: "var(--lane-line)" }}
          strokeWidth={2}
        />
        <rect
          x={LANE_X0}
          y={headTop}
          width={POOL_W}
          height={headBot - headTop}
          style={{ fill: "var(--lane-head)", stroke: "var(--lane-line)" }}
          strokeWidth={1.5}
        />
        <text
          x={poolCx}
          y={poolCy}
          textAnchor="middle"
          fontSize={15}
          fontWeight={700}
          style={soft}
          transform={`rotate(-90 ${poolCx} ${poolCy})`}
        >
          GESTIÓN DE SOLICITUDES DE MEJORA
        </text>
        {LANES.map((L) => {
          const cx = LANE_X0 + POOL_W + HEAD_W / 2;
          const cy = (L.y0 + L.y1) / 2;
          return (
            <g key={L.n}>
              <rect
                x={LANE_X0 + POOL_W}
                y={L.y0}
                width={HEAD_W}
                height={L.y1 - L.y0}
                style={{ fill: "var(--lane-head)", stroke: "var(--lane-line)" }}
                strokeWidth={1.5}
              />
              <line
                x1={LANE_X0}
                y1={L.y1}
                x2={LANE_X1}
                y2={L.y1}
                style={{ stroke: "var(--lane-line)" }}
                strokeWidth={1.5}
              />
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                fontSize={13}
                fontWeight={700}
                style={soft}
                transform={`rotate(-90 ${cx} ${cy})`}
              >
                {L.n}
              </text>
            </g>
          );
        })}
      </g>

      {/* edges */}
      <g>
        {EDGES.map((e, i) => {
          const pts = route(e);
          const lab = e[4];
          const [a, b] = pts;
          const horiz = Math.abs(a[1] - b[1]) < 2;
          return (
            <g key={i}>
              <polyline
                points={pts.map((p) => p.join(",")).join(" ")}
                fill="none"
                style={{ stroke: "var(--flow)" }}
                strokeWidth={2.2}
                markerEnd="url(#ar)"
              />
              {lab && (
                <text
                  x={(a[0] + b[0]) / 2 + (horiz ? 0 : 12)}
                  y={(a[1] + b[1]) / 2 + (horiz ? -8 : 0)}
                  textAnchor={horiz ? "middle" : "start"}
                  fontSize={15}
                  style={soft}
                >
                  {lab}
                </text>
              )}
            </g>
          );
        })}
      </g>

      {/* artifacts, associations, gateways, events */}
      <g>
        {NODES.filter((n) => n.t === "d" || n.t === "b").map((n) => {
          const d = dims(n);
          const x = n.x - d.w / 2;
          const y = n.y - d.h / 2;
          const lines = wrapWords(n.l, 16);
          const startY = y - 6 - (lines.length - 1) * 12;
          const isLinked = linked.has(n.l);
          const artStyle = isLinked
            ? { fill: "var(--link-fill)", stroke: "var(--accent)" }
            : { fill: "var(--doc-fill)", stroke: "var(--doc-line)" };
          const sw = isLinked ? 2.4 : 1.6;
          return (
            <g key={n.id}>
              {n.t === "d" ? (
                <path
                  d={`M${x},${y} H${x + d.w} V${y + d.h - 14} L${x + d.w - 14},${y + d.h} H${x} Z`}
                  style={artStyle}
                  strokeWidth={sw}
                />
              ) : (
                <>
                  <ellipse cx={n.x} cy={y + 11} rx={d.w / 2} ry={11} style={artStyle} strokeWidth={sw} />
                  <path
                    d={`M${x},${y + 11} V${y + d.h - 11} A${d.w / 2},11 0 0 0 ${x + d.w},${y + d.h - 11} V${y + 11}`}
                    style={artStyle}
                    strokeWidth={sw}
                  />
                </>
              )}
              {lines.map((ln, i) => (
                <text
                  key={i}
                  x={n.x}
                  y={startY + i * 12}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={isLinked ? 600 : undefined}
                  style={isLinked ? { fill: "var(--accent)" } : soft}
                >
                  {ln}
                </text>
              ))}
            </g>
          );
        })}

        {ASSOCIATIONS.map(([a, b]) => (
          <line
            key={a + b}
            x1={BY_ID[a].x}
            y1={BY_ID[a].y}
            x2={BY_ID[b].x}
            y2={BY_ID[b].y}
            style={{ stroke: "var(--doc-line)" }}
            strokeWidth={1.4}
            strokeDasharray="5 5"
            opacity={0.75}
          />
        ))}

        {NODES.map((n) => {
          if (n.t === "g" || n.t === "p") {
            const r = GW / 2;
            return (
              <g key={n.id}>
                <path
                  d={`M${n.x},${n.y - r} L${n.x + r},${n.y} L${n.x},${n.y + r} L${n.x - r},${n.y} Z`}
                  fill="#FFE699"
                  stroke="#BF8F00"
                  strokeWidth={2}
                />
                <path
                  d={
                    n.t === "g"
                      ? `M${n.x - 11},${n.y - 11} L${n.x + 11},${n.y + 11} M${n.x + 11},${n.y - 11} L${n.x - 11},${n.y + 11}`
                      : `M${n.x - 13},${n.y} H${n.x + 13} M${n.x},${n.y - 13} V${n.y + 13}`
                  }
                  stroke="#7F6000"
                  strokeWidth={3.4}
                />
                {n.t === "g" &&
                  wrapWords(n.l, 18).map((ln, i) => (
                    <text key={i} x={n.x} y={n.y + r + 16 + i * 13} textAnchor="middle" fontSize={12} style={soft}>
                      {ln}
                    </text>
                  ))}
              </g>
            );
          }
          if (n.t === "e" || n.t === "f" || n.t === "k") {
            const r = n.t === "k" ? KR : ER;
            const fill = n.t === "e" ? "#C5E0B4" : n.t === "f" ? "#F4B6B6" : "#FFF2CC";
            const line = n.t === "e" ? "#548235" : n.t === "f" ? "#C00000" : "#BF8F00";
            return (
              <g key={n.id}>
                <circle cx={n.x} cy={n.y} r={r} fill={fill} stroke={line} strokeWidth={n.t === "f" ? 4 : 2.6} />
                {n.t === "k" && (
                  <>
                    <circle cx={n.x} cy={n.y} r={r - 6} fill="none" stroke={line} strokeWidth={2} />
                    <path
                      d={`M${n.x},${n.y - 10} V${n.y} L${n.x + 7},${n.y + 5}`}
                      stroke={line}
                      strokeWidth={2.4}
                      fill="none"
                    />
                  </>
                )}
                <text x={n.x} y={n.y + r + 17} textAnchor="middle" fontSize={12} style={soft}>
                  {n.l}
                </text>
              </g>
            );
          }
          return null;
        })}
      </g>
    </svg>
  );
});
