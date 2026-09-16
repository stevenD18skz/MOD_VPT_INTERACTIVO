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
  ENDS,
  GATEWAYS,
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
  DOC_STATUSES,
  PHASE_DOCS,
  W,
  branchLockedNodes,
  dims,
  docsForStep,
  gatewayBranches,
  leadsToEnd,
  normalizeUrl,
  stepsForDoc,
  upstreamPath,
  upstreamSteps,
  laneOf,
  phaseOf,
  route,
  wrapWords,
  type ClosedState,
  type DocStatus,
  type FlowNode,
  type NodeState,
  type UpstreamPath,
} from "@/lib/flow-definition";
import {
  closeEnd,
  reopenEnd,
  setDocLink,
  setDocStatus,
  setGatewayAnswer,
  setNodeNote,
  setNodeStatus,
  useFlows,
  useStoreMode,
  useUploadsEnabled,
  type Flow,
} from "@/lib/flow-store";
import { ClipGlyph, MaterialPanel } from "./material-panel";
import { OfflineNotice, SyncBadge } from "./sync-badge";
import { ThemeToggle } from "./theme-toggle";

/** Límites de zoom del lienzo: por debajo de MIN_SCALE el diagrama deja de ser legible. */
const MIN_SCALE = 0.25;
const MAX_SCALE = 3;

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
  /** Panel lateral abierto: documentos del flujo o material de apoyo. */
  const [panel, setPanel] = useState<"docs" | "material" | null>(null);
  const uploads = useUploadsEnabled();

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
    applyScale(Math.max(MIN_SCALE, (vp.clientHeight - 16) / H));
    vp.scrollLeft = 0;
    vp.scrollTop = 0;
  }, [applyScale]);

  const zoomAt = useCallback(
    (f: number, cx: number, cy: number) => {
      const vp = vpRef.current;
      if (!vp) return;
      const old = scaleRef.current;
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, old * f));
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

  /** Fija el zoom a un porcentaje exacto (desde el input), centrado en el visor. */
  const setZoomPercent = (percent: number) => {
    const old = scaleRef.current;
    if (old > 0) zoomCenter(percent / 100 / old);
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

  // Escape cierra el panel lateral, pero solo si no hay un popover abierto encima.
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !openIdRef.current) setPanel(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panel]);

  const links = flow.links ?? NO_LINKS;
  const docStatus = flow.docs ?? NO_DOCS;
  const linked = useMemo(() => new Set(Object.keys(links)), [links]);
  const closed = flow.closed ?? null;
  // Camino ganador hacia el final cerrado: todo lo que NO esté aquí se atenúa y se bloquea.
  const closedPath = useMemo(() => (closed ? upstreamPath(closed.endId) : null), [closed]);
  const gatewayAnswers = flow.gatewayAnswers ?? NO_ANSWERS;
  // Ramas descartadas por respuestas de compuertas ya guardadas (sin que el flujo
  // esté cerrado del todo): se atenúan y se bloquean igual que el resto de un cierre.
  const branchLocked = useMemo(() => branchLockedNodes(gatewayAnswers), [gatewayAnswers]);
  const isLocked = (id: string) =>
    closed !== null ? id !== closed.endId && !closedPath!.nodes.has(id) : branchLocked.has(id);
  // "Respondida" para el badge del rombo: si el cierre actual ya la resolvió, manda eso
  // (una respuesta vieja guardada no cuenta si quedó bloqueada por ese cierre).
  const isGatewayAnswered = (id: string) => {
    if (closed) return closedPath!.nodes.has(id);
    return Boolean(gatewayAnswers[id]);
  };
  const done = EDITABLE.filter((n) => flow.nodes[n.id]?.s === "done").length;
  const docsLinked = DOC_KEYS.filter((k) => links[k]).length;
  const docsDone = DOC_KEYS.filter((k) => docStatus[k] === "done").length;
  const openNode = openId ? BY_ID[openId] : null;
  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id));

  /** Lleva el lienzo hasta un nodo, lo centra y abre su popover. */
  const focusNode = (id: string) => {
    const vp = vpRef.current;
    const n = BY_ID[id];
    if (!vp || !n) return;
    const s = Math.max(scaleRef.current, 0.9);
    if (s !== scaleRef.current) applyScale(s);
    vp.scrollTo({ left: n.x * s - vp.clientWidth / 2, top: n.y * s - vp.clientHeight / 2, behavior: "smooth" });
    setPanel(null);
    setOpenId(id);
  };

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
          <ZoomInput zoom={zoom} min={MIN_SCALE * 100} max={MAX_SCALE * 100} onCommit={setZoomPercent} />
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
        <ThemeToggle className={styles.tb} />
        <span className={styles.progress}>
          {done} / {EDITABLE.length} listas
        </span>
        <button
          type="button"
          className={`${styles.tb} ${styles.docsBtn}`}
          aria-expanded={panel === "docs"}
          aria-controls="docs-drawer"
          onClick={() => setPanel((p) => (p === "docs" ? null : "docs"))}
          title="Ver y gestionar todos los documentos del flujo"
        >
          <DocGlyph />
          {docsLinked} / {DOC_KEYS.length} docs con enlace
          <span className={styles.docsBtnDone}>{docsDone} completos</span>
        </button>
        <button
          type="button"
          className={`${styles.tb} ${styles.docsBtn}`}
          aria-expanded={panel === "material"}
          aria-controls="material-drawer"
          onClick={() => setPanel((p) => (p === "material" ? null : "material"))}
          title="Manuales, guías, plantillas y enlaces de esta automatización"
        >
          <ClipGlyph />
          Material de apoyo
          <span className={styles.countBadge}>{flow.materials?.length ?? 0}</span>
        </button>
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
            <Diagram
              linked={linked}
              docStatus={docStatus}
              closed={closed}
              closedPath={closedPath}
              gatewayAnswers={gatewayAnswers}
              branchLocked={branchLocked}
            />
            {EDITABLE.map((n) => (
              <StepNode
                key={n.id}
                node={n}
                state={flow.nodes[n.id]}
                selected={openId === n.id}
                dimmed={isLocked(n.id)}
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
            {ENDS.map((n) => (
              <EndNode
                key={n.id}
                node={n}
                active={closed?.endId === n.id}
                dimmed={isLocked(n.id)}
                selected={openId === n.id}
                nodeRef={(el) => {
                  nodeEls.current[n.id] = el;
                }}
                onClick={() => toggle(n.id)}
              />
            ))}
            {GATEWAYS.map((n) => (
              <GatewayNode
                key={n.id}
                node={n}
                answered={isGatewayAnswered(n.id)}
                dimmed={isLocked(n.id)}
                selected={openId === n.id}
                nodeRef={(el) => {
                  nodeEls.current[n.id] = el;
                }}
                onClick={() => toggle(n.id)}
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
          aria-label={
            isEnd(openNode)
              ? "Cerrar o reabrir este final"
              : isGateway(openNode)
                ? "Responder esta compuerta"
                : isDoc(openNode)
                  ? "Enlace del documento"
                  : "Editar paso"
          }
        >
          {isEnd(openNode) ? (
            <EndPanel
              key={openNode.id}
              flowId={flow.id}
              node={openNode}
              closed={closed}
              locked={isLocked(openNode.id)}
              onClose={() => setOpenId(null)}
            />
          ) : isGateway(openNode) ? (
            <GatewayPanel
              key={openNode.id}
              flowId={flow.id}
              node={openNode}
              closed={closed}
              closedPath={closedPath}
              gatewayAnswers={gatewayAnswers}
              locked={isLocked(openNode.id)}
              onClose={() => setOpenId(null)}
              onGo={focusNode}
            />
          ) : isDoc(openNode) ? (
            <DocPanel
              key={openNode.id}
              flowId={flow.id}
              node={openNode}
              url={links[openNode.l]}
              status={docStatus[openNode.l] ?? "empty"}
              onClose={() => setOpenId(null)}
            />
          ) : (
            <StepEditor
              key={openNode.id}
              flowId={flow.id}
              node={openNode}
              state={flow.nodes[openNode.id] ?? {}}
              links={links}
              docStatus={docStatus}
              locked={isLocked(openNode.id)}
              closedEndNode={closed ? BY_ID[closed.endId] : null}
              onClose={() => setOpenId(null)}
            />
          )}
        </div>
      )}

      {panel === "docs" && (
        <DocsDrawer
          flowId={flow.id}
          links={links}
          docStatus={docStatus}
          onClose={() => setPanel(null)}
          onGo={focusNode}
        />
      )}
      {panel === "material" && <MaterialPanel flow={flow} uploads={uploads} onClose={() => setPanel(null)} />}
    </div>
  );
}

/** Nivel de zoom editable: escribe un valor y confírmalo con Enter (o al salir del campo). */
function ZoomInput({
  zoom,
  min,
  max,
  onCommit,
}: {
  zoom: number;
  min: number;
  max: number;
  onCommit: (percent: number) => void;
}) {
  const [draft, setDraft] = useState(String(zoom));
  const editing = useRef(false);

  // Sigue el zoom real (botones, rueda, "Ajustar alto"…) mientras no se esté editando.
  useEffect(() => {
    if (!editing.current) setDraft(String(zoom));
  }, [zoom]);

  const commit = () => {
    // Number("") es 0, no NaN: hay que tratar el vacío como inválido a mano,
    // si no un campo en blanco se leería como "poner el zoom al mínimo".
    const trimmed = draft.trim();
    const n = trimmed === "" ? NaN : Number(trimmed);
    const clamped = Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : zoom;
    if (clamped !== zoom) onCommit(clamped);
    setDraft(String(clamped));
    editing.current = false;
  };

  return (
    <span className={styles.zoomBox}>
      <input
        type="number"
        inputMode="numeric"
        className={styles.zoomInput}
        value={draft}
        min={min}
        max={max}
        step={5}
        aria-label={`Nivel de zoom, entre ${min}% y ${max}%`}
        onFocus={(e) => {
          editing.current = true;
          e.target.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(String(zoom));
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <span aria-hidden>%</span>
    </span>
  );
}

/* ================= editable node ================= */
function StepNode({
  node,
  state,
  selected,
  dimmed,
  nodeRef,
  onClick,
}: {
  node: FlowNode;
  state: NodeState | undefined;
  selected: boolean;
  dimmed: boolean;
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
      className={`${styles.node} ${selected ? styles.sel : ""} ${dimmed ? styles.dimmed : ""}`}
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
  docStatus,
  locked,
  closedEndNode,
  onClose,
}: {
  flowId: string;
  node: FlowNode;
  state: NodeState;
  links: Record<string, string>;
  docStatus: Record<string, DocStatus>;
  locked: boolean;
  closedEndNode: FlowNode | null;
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
      {locked && (
        <p className={styles.hint} style={{ margin: "0 0 10px" }}>
          {closedEndNode
            ? `🔒 Deshabilitado: el flujo se cerró por «Fin» en ${phaseOf(closedEndNode.x)} · ${laneOf(closedEndNode.y)}, que no pasa por aquí. Solo se puede ver.`
            : "🔒 Deshabilitado: quedó fuera de la rama elegida en una compuerta (Sí/No) de este flujo. Solo se puede ver."}
        </p>
      )}
      <p className={styles.lbl}>Estado</p>
      <div className={styles.states}>
        {STATUSES.map((s) => (
          <button
            key={s.key}
            type="button"
            className={styles.st}
            data-s={s.key}
            aria-pressed={status === s.key}
            disabled={locked}
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
              <DocLinkRow
                key={d.id}
                flowId={flowId}
                doc={d}
                url={links[d.l]}
                status={docStatus[d.l] ?? "empty"}
              />
            ))}
          </div>
        </>
      )}
      <p className={styles.lbl}>Comentarios y enlaces</p>
      <textarea
        className={styles.notes}
        value={draft}
        disabled={locked}
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
const NO_DOCS: Record<string, DocStatus> = {};
const NO_ANSWERS: Record<string, string> = {};

function DocGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M4 1.5h5.5l3 3v10h-8.5z" strokeLinejoin="round" />
      <path d="M9.5 1.5v3h3M6 8.5h4.5M6 11h4.5" />
    </svg>
  );
}

function DbGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <ellipse cx="8" cy="3.5" rx="5" ry="2" />
      <path d="M3 3.5v9c0 1.1 2.2 2 5 2s5-.9 5-2v-9M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" />
    </svg>
  );
}

/** Selector de estado de un documento (Vacío / En progreso / Completo). */
function DocStatusSeg({ value, onChange }: { value: DocStatus; onChange: (s: DocStatus) => void }) {
  return (
    <div className={styles.seg} role="radiogroup" aria-label="Estado del documento">
      {DOC_STATUSES.map((s) => (
        <button
          key={s.key}
          type="button"
          role="radio"
          aria-checked={value === s.key}
          data-ds={s.key}
          className={styles.segBtn}
          onClick={() => value !== s.key && onChange(s.key)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

const DRAWER_FILTERS = [
  { key: "all", label: "Todos" },
  { key: "pending", label: "Pendientes" },
  { key: "nolink", label: "Sin enlace" },
] as const;
type DrawerFilter = (typeof DRAWER_FILTERS)[number]["key"];

/** Panel lateral con todos los documentos del flujo, agrupados por fase. */
function DocsDrawer({
  flowId,
  links,
  docStatus,
  onClose,
  onGo,
}: {
  flowId: string;
  links: Record<string, string>;
  docStatus: Record<string, DocStatus>;
  onClose: () => void;
  onGo: (nodeId: string) => void;
}) {
  const [filter, setFilter] = useState<DrawerFilter>("all");
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);

  const statusOf = (key: string) => docStatus[key] ?? "empty";
  const count = (s: DocStatus) => DOC_KEYS.filter((k) => statusOf(k) === s).length;
  const total = DOC_KEYS.length;
  const matches = (key: string) =>
    filter === "all" || (filter === "pending" ? statusOf(key) !== "done" : !links[key]);
  const groups = PHASE_DOCS.map((g) => ({ ...g, shown: g.docs.filter((d) => matches(d.key)) }));

  return (
    <aside id="docs-drawer" className={styles.drawer} aria-label="Documentos del flujo">
      <header className={styles.drawerHead}>
        <div>
          <h2 className={styles.drawerTitle}>Documentos del flujo</h2>
          <p className={styles.drawerSub}>
            {count("done")} de {total} completos · {DOC_KEYS.filter((k) => links[k]).length} con enlace
          </p>
        </div>
        <button
          ref={closeRef}
          type="button"
          className={styles.iconBtn}
          onClick={onClose}
          aria-label="Cerrar panel de documentos"
        >
          ✕
        </button>
      </header>
      <div className={styles.drawerMeter} aria-hidden>
        <span data-ds="done" style={{ width: `${(count("done") / total) * 100}%` }} />
        <span data-ds="prog" style={{ width: `${(count("prog") / total) * 100}%` }} />
      </div>
      <div className={styles.drawerLegend}>
        {DOC_STATUSES.map((s) => (
          <span key={s.key}>
            <i data-ds={s.key} /> {s.label} <b>{count(s.key)}</b>
          </span>
        ))}
      </div>
      <div className={styles.chips} role="group" aria-label="Filtrar documentos">
        {DRAWER_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={styles.chip}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className={styles.drawerBody}>
        {groups.map(
          (g) =>
            g.shown.length > 0 && (
              <section key={g.phase} className={styles.phaseGroup}>
                <h3 className={styles.phaseHead}>
                  <span>{g.phase}</span>
                  <span className={styles.phaseCount}>
                    {g.docs.filter((d) => statusOf(d.key) === "done").length}/{g.docs.length} completos
                  </span>
                </h3>
                <ul className={styles.dlist}>
                  {g.shown.map((d) => (
                    <DrawerDoc
                      key={d.key}
                      flowId={flowId}
                      docKey={d.key}
                      node={d.node}
                      url={links[d.key]}
                      status={statusOf(d.key)}
                      onGo={onGo}
                    />
                  ))}
                </ul>
              </section>
            ),
        )}
        {groups.every((g) => g.shown.length === 0) && (
          <p className={styles.drawerEmpty}>
            {filter === "pending"
              ? "¡Todos los documentos están completos!"
              : "Todos los documentos tienen enlace."}
          </p>
        )}
      </div>
    </aside>
  );
}

function DrawerDoc({
  flowId,
  docKey,
  node,
  url,
  status,
  onGo,
}: {
  flowId: string;
  docKey: string;
  node: FlowNode;
  url: string | undefined;
  status: DocStatus;
  onGo: (nodeId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [flash, setFlash] = useFlash();
  const phase = phaseOf(node.x);
  const steps = stepsForDoc(docKey).filter((s) => phaseOf(s.x) === phase);

  return (
    <li className={styles.dcard} data-ds={status}>
      <div className={styles.dcardTop}>
        <span className={styles.dicon}>{node.t === "d" ? <DocGlyph /> : <DbGlyph />}</span>
        <div className={styles.dmain}>
          <p className={styles.dname}>{docKey}</p>
          {steps.length > 0 && <p className={styles.dused}>{steps.map((s) => s.l).join(" · ")}</p>}
        </div>
        <button
          type="button"
          className={styles.dgo}
          onClick={() => onGo(node.id)}
          title="Ver este documento en el diagrama"
        >
          Ir →
        </button>
      </div>
      <DocStatusSeg
        value={status}
        onChange={(s) => {
          setDocStatus(flowId, docKey, s);
          setFlash("Estado actualizado");
        }}
      />
      <div className={styles.dactions}>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className={styles.docOpen}>
            Abrir ↗
          </a>
        )}
        {!editing && (
          <button type="button" className={styles.docAction} onClick={() => setEditing(true)}>
            {url ? "Editar enlace" : "+ Agregar enlace"}
          </button>
        )}
        <span className={styles.spacer} />
        {flash && (
          <span className={styles.ok} role="status">
            ✓ {flash}
          </span>
        )}
      </div>
      {editing && (
        <DocLinkForm
          initial={url}
          onSave={(u) => {
            setDocLink(flowId, docKey, u);
            setEditing(false);
            setFlash(url ? "Enlace actualizado" : "Enlace guardado");
          }}
          onRemove={
            url
              ? () => {
                  setDocLink(flowId, docKey, null);
                  setEditing(false);
                  setFlash("Enlace eliminado");
                }
              : undefined
          }
          onCancel={() => setEditing(false)}
        />
      )}
    </li>
  );
}

const isDoc = (n: FlowNode) => n.t === "d" || n.t === "b";
const isEnd = (n: FlowNode) => n.t === "f";
const isGateway = (n: FlowNode) => n.t === "g";

/**
 * Zona sobre un documento del diagrama. Con enlace: clic izquierdo lo abre en una
 * pestaña nueva (con una pista al pasar el mouse), clic derecho edita el enlace.
 * Sin enlace: se deja sin decorar; un clic (izquierdo o derecho) abre el editor.
 */
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
            onContextMenu={(e) => {
              e.preventDefault();
              onEdit();
            }}
            title="Clic derecho para editar el enlace"
            aria-label={`Abrir ${node.l} en una nueva pestaña. Clic derecho para editar el enlace.`}
          />
          <span className={styles.artTip} aria-hidden>
            Abrir ↗
          </span>
        </>
      ) : (
        <>
          <button
            type="button"
            className={styles.artHit}
            onClick={onEdit}
            onContextMenu={(e) => {
              e.preventDefault();
              onEdit();
            }}
            title="Clic para agregar el enlace"
            aria-label={`Agregar enlace a ${node.l}`}
          />
          <span className={styles.artTip} aria-hidden>
            + Agregar enlace
          </span>
        </>
      )}
    </div>
  );
}

/**
 * Círculo "Fin": si no hay nada cerrado, un clic lo cierra (marca listos los pasos
 * previos y deshabilita el resto del flujo). Si este es el final cerrado, abre su
 * detalle para reabrir. Si el flujo se cerró por OTRO final, aparece atenuado.
 */
function EndNode({
  node,
  active,
  dimmed,
  selected,
  nodeRef,
  onClick,
}: {
  node: FlowNode;
  active: boolean;
  dimmed: boolean;
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
      className={`${styles.endHit} ${active ? styles.endClosed : ""} ${selected ? styles.endSel : ""} ${dimmed ? styles.dimmed : ""}`}
      style={{ left: node.x - d.w / 2, top: node.y - d.h / 2, width: d.w, height: d.h }}
      onClick={onClick}
      aria-label={
        active
          ? `Final cerrado: ${node.l}. Ver detalle o reabrir.`
          : dimmed
            ? `${node.l} (deshabilitado: no aplica en el camino actual)`
            : `Cerrar este final: ${node.l}`
      }
      title={active ? "Final cerrado · clic para ver detalle" : dimmed ? "No aplica en el camino actual" : "Clic para cerrar este final"}
    />
  );
}

/** Rombo de decisión (Sí/No…): un clic abre el panel para elegir qué rama se tomó. */
function GatewayNode({
  node,
  answered,
  dimmed,
  selected,
  nodeRef,
  onClick,
}: {
  node: FlowNode;
  answered: boolean;
  dimmed: boolean;
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
      className={`${styles.gwHit} ${answered ? styles.gwAnswered : ""} ${selected ? styles.endSel : ""} ${dimmed ? styles.dimmed : ""}`}
      style={{ left: node.x - d.w / 2, top: node.y - d.h / 2, width: d.w, height: d.h }}
      onClick={onClick}
      aria-label={`${node.l}${answered ? " (respondida)" : ""}${dimmed ? " (deshabilitada: no aplica en el camino actual)" : ""}`}
      title={dimmed ? "No aplica en el camino actual" : answered ? "Ya respondida · clic para ver o cambiar" : "Clic para responder"}
    />
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
  status,
  onClose,
}: {
  flowId: string;
  node: FlowNode;
  url: string | undefined;
  status: DocStatus;
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
      <p className={styles.lbl}>Estado</p>
      <DocStatusSeg
        value={status}
        onChange={(s) => {
          setDocStatus(flowId, node.l, s);
          setFlash("Estado actualizado");
        }}
      />
      <div className={styles.gap} />
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

/**
 * Popover de un evento "Fin". Solo un final puede estar cerrado a la vez:
 * - Sin nada cerrado: ofrece cerrar por acá (marca Done el camino y deshabilita el resto).
 * - Cerrado por ESTE final: muestra el resultado y permite deshacer (vuelve exacto a
 *   como estaba antes de cerrar).
 * - Cerrado por OTRO final: solo informa; hay que reabrir aquello primero.
 */
function EndPanel({
  flowId,
  node,
  closed,
  locked,
  onClose,
}: {
  flowId: string;
  node: FlowNode;
  closed: ClosedState | null;
  locked: boolean;
  onClose: () => void;
}) {
  const [flash, setFlash] = useFlash();
  const steps = useMemo(() => upstreamSteps(node.id), [node.id]);
  const isActive = closed?.endId === node.id;
  const blockedByOther = closed !== null && !isActive;
  const otherEnd = blockedByOther ? BY_ID[closed.endId] : null;
  const blockedByBranch = closed === null && locked;

  return (
    <>
      <p className={styles.ttl}>{node.l}</p>
      <div className={styles.crumb}>
        {phaseOf(node.x)} · {laneOf(node.y)}
      </div>
      <p className={styles.lbl}>Estado</p>
      {isActive ? (
        <>
          <p className={styles.hint} style={{ margin: "0 0 10px" }}>
            ✓ Terminado: la automatización llegó hasta aquí. Los {steps.length} pasos de este camino quedaron en
            Done; el resto del flujo se deshabilitó.
          </p>
          <button
            type="button"
            className={styles.tb}
            onClick={() => {
              reopenEnd(flowId, node.id);
              setFlash("Reabierto");
            }}
          >
            Deshacer
          </button>
          <p className={styles.hint}>
            Los pasos de este camino vuelven exactamente a como estaban antes de cerrar, y el resto del flujo se
            vuelve a habilitar.
          </p>
        </>
      ) : blockedByOther ? (
        <p className={styles.hint} style={{ margin: 0 }}>
          Este flujo ya se cerró por «Fin» en {phaseOf(otherEnd!.x)} · {laneOf(otherEnd!.y)}. Deshaz ese cierre
          para poder cerrar por acá.
        </p>
      ) : blockedByBranch ? (
        <p className={styles.hint} style={{ margin: 0 }}>
          🔒 Deshabilitado: este final quedó fuera de la rama elegida en una compuerta (Sí/No) anterior. Solo se
          puede ver.
        </p>
      ) : (
        <>
          <p className={styles.hint} style={{ margin: "0 0 10px" }}>
            Marca que la automatización terminó aquí: los {steps.length} pasos de este camino quedarán en Done,
            y el resto del flujo se deshabilitará (no se podrá editar). Se puede deshacer después.
          </p>
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              closeEnd(flowId, node.id);
              setFlash("Marcado como terminado");
            }}
          >
            Marcar como terminado
          </button>
        </>
      )}
      <div className={styles.foot}>
        <span className={`${styles.saved} ${flash ? styles.ok : ""}`} role="status">
          {flash && `✓ ${flash}`}
        </span>
        <button type="button" className={styles.tb} onClick={onClose}>
          Cerrar
        </button>
      </div>
    </>
  );
}

/**
 * Popover de una compuerta (Sí/No…): elegir una rama la marca respondida y, según a
 * dónde lleve, o cierra el flujo por ese final (si llega directo a un Fin) o abre el
 * siguiente paso de esa rama. Bloqueada si el flujo ya se cerró por otro camino.
 */
function GatewayPanel({
  flowId,
  node,
  closed,
  closedPath,
  gatewayAnswers,
  locked,
  onClose,
  onGo,
}: {
  flowId: string;
  node: FlowNode;
  closed: ClosedState | null;
  closedPath: UpstreamPath | null;
  gatewayAnswers: Record<string, string>;
  locked: boolean;
  onClose: () => void;
  onGo: (id: string) => void;
}) {
  const [flash, setFlash] = useFlash();
  const branches = useMemo(() => gatewayBranches(node.id), [node.id]);
  const resolvedByClosure = closed !== null && closedPath!.nodes.has(node.id);
  const blockedByClosure = closed !== null && !resolvedByClosure;
  const blockedByBranch = closed === null && locked;
  const savedAnswer = gatewayAnswers[node.id];

  const choose = (target: string) => {
    const end = leadsToEnd(target);
    if (end) {
      closeEnd(flowId, end);
      onGo(end);
    } else {
      setGatewayAnswer(flowId, node.id, target);
      onGo(target);
    }
  };

  return (
    <>
      <p className={styles.ttl}>{node.l}</p>
      <div className={styles.crumb}>
        {phaseOf(node.x)} · {laneOf(node.y)}
      </div>
      {blockedByClosure ? (
        <p className={styles.hint} style={{ margin: 0 }}>
          🔒 Deshabilitada: el flujo se cerró por «Fin» en {phaseOf(BY_ID[closed!.endId].x)} ·{" "}
          {laneOf(BY_ID[closed!.endId].y)}, que no pasa por aquí.
        </p>
      ) : blockedByBranch ? (
        <p className={styles.hint} style={{ margin: 0 }}>
          🔒 Deshabilitada: quedó fuera de la rama elegida en una compuerta (Sí/No) anterior. Solo se puede ver.
        </p>
      ) : resolvedByClosure ? (
        <p className={styles.hint} style={{ margin: 0 }}>
          ✓ Se respondió «{branches.find((b) => closedPath!.edges.has(b.edgeIndex))?.label || "?"}»: el flujo
          terminó por ese camino.
        </p>
      ) : (
        <>
          <p className={styles.lbl}>Respuesta</p>
          <p className={styles.hint} style={{ margin: "0 0 8px" }}>
            Elige la rama que tomó esta iniciativa. Si termina en un «Fin», el flujo se marca como completado
            (y el resto se deshabilita); si sigue de largo, te lleva al siguiente paso.
          </p>
          <div className={styles.states}>
            {branches.map((b) => (
              <button
                key={b.edgeIndex}
                type="button"
                className={styles.st}
                aria-pressed={savedAnswer === b.target}
                onClick={() => choose(b.target)}
              >
                {b.label || "(sin etiqueta)"}
              </button>
            ))}
          </div>
          {savedAnswer && (
            <button
              type="button"
              className={styles.danger}
              style={{ marginTop: 8 }}
              onClick={() => {
                setGatewayAnswer(flowId, node.id, null);
                setFlash("Respuesta borrada");
              }}
            >
              Borrar respuesta
            </button>
          )}
        </>
      )}
      <div className={styles.foot}>
        <span className={`${styles.saved} ${flash ? styles.ok : ""}`} role="status">
          {flash && `✓ ${flash}`}
        </span>
        <button type="button" className={styles.tb} onClick={onClose}>
          Cerrar
        </button>
      </div>
    </>
  );
}

/** Fila de un documento dentro del popover de un paso. */
function DocLinkRow({
  flowId,
  doc,
  url,
  status,
}: {
  flowId: string;
  doc: FlowNode;
  url: string | undefined;
  status: DocStatus;
}) {
  const [editing, setEditing] = useState(false);
  const [flash, setFlash] = useFlash();
  const i = DOC_STATUSES.findIndex((s) => s.key === status);
  const current = DOC_STATUSES[i];
  const next = DOC_STATUSES[(i + 1) % DOC_STATUSES.length];

  return (
    <div className={styles.docItem}>
      <div className={styles.docRow}>
        <button
          type="button"
          className={styles.dsPill}
          data-ds={status}
          onClick={() => setDocStatus(flowId, doc.l, next.key)}
          title={`Estado: ${current.label}. Clic para marcar «${next.label}»`}
          aria-label={`Estado de ${doc.l}: ${current.label}. Cambiar a ${next.label}`}
        >
          {current.label}
        </button>
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

const DOC_COLORS: Record<DocStatus, { fill: string; stroke: string }> = {
  empty: { fill: "var(--doc-fill)", stroke: "var(--doc-line)" },
  prog: { fill: "var(--prog-fill)", stroke: "var(--prog-line)" },
  done: { fill: "var(--done-fill)", stroke: "var(--done-line)" },
};

const DIM_OPACITY = 0.25;

const Diagram = memo(function Diagram({
  linked,
  docStatus,
  closed,
  closedPath,
  gatewayAnswers,
  branchLocked,
}: {
  linked: Set<string>;
  docStatus: Record<string, DocStatus>;
  closed: ClosedState | null;
  closedPath: UpstreamPath | null;
  gatewayAnswers: Record<string, string>;
  branchLocked: Set<string>;
}) {
  const closedEndId = closed?.endId ?? null;
  // El final activo nunca se atenúa (upstreamPath no se incluye a sí mismo en `nodes`).
  // Sin cierre, se atenúa lo que quedó fuera de la rama elegida en alguna compuerta.
  const dimNode = (id: string) =>
    closedPath !== null ? id !== closedEndId && !closedPath.nodes.has(id) : branchLocked.has(id);
  // Una flecha se atenúa por el cierre actual, o (sin cierre) si conecta con un nodo
  // que quedó bloqueado por la rama descartada de alguna compuerta.
  const dimEdge = (i: number) => {
    if (closedPath !== null) return !closedPath.edges.has(i);
    const [from, , to] = EDGES[i];
    return branchLocked.has(from) || branchLocked.has(to);
  };
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
            <text x={(p.x0 + p.x1) / 2} y={34} textAnchor="middle" fontSize={24} fontWeight={700} style={soft}>
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
          fontSize={16}
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
                fontSize={14}
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
            <g key={i} opacity={dimEdge(i) ? DIM_OPACITY : 1}>
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
                  fontSize={16}
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
          const lines = wrapWords(n.l, 15);
          const startY = y - 6 - (lines.length - 1) * 13;
          const isLinked = linked.has(n.l);
          const st = docStatus[n.l] ?? "empty";
          // El color dice el estado; un documento vacío pero enlazado se ve azul.
          const artStyle =
            st === "empty" && isLinked ? { fill: "var(--link-fill)", stroke: "var(--accent)" } : DOC_COLORS[st];
          const sw = st !== "empty" || isLinked ? 2.4 : 1.6;
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
              {st !== "empty" && (
                <g>
                  <circle cx={x + 2} cy={y + 2} r={9} style={{ fill: DOC_COLORS[st].stroke }} />
                  {st === "done" ? (
                    <path d={`M${x - 2.5},${y + 2} l3,3 l5,-6`} stroke="#fff" strokeWidth={2} fill="none" />
                  ) : (
                    <circle cx={x + 2} cy={y + 2} r={3} fill="#fff" />
                  )}
                </g>
              )}
              {lines.map((ln, i) => (
                <text
                  key={i}
                  x={n.x}
                  y={startY + i * 13}
                  textAnchor="middle"
                  fontSize={12}
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
            const answered =
              n.t === "g" && (closedPath ? closedPath.nodes.has(n.id) : Boolean(gatewayAnswers[n.id]));
            return (
              <g key={n.id} opacity={dimNode(n.id) ? DIM_OPACITY : 1}>
                <path
                  d={`M${n.x},${n.y - r} L${n.x + r},${n.y} L${n.x},${n.y + r} L${n.x - r},${n.y} Z`}
                  fill="#FFE699"
                  stroke={answered ? "var(--done-line)" : "#BF8F00"}
                  strokeWidth={answered ? 3 : 2}
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
                {answered && (
                  <g>
                    <circle cx={n.x - r + 3} cy={n.y - r + 3} r={9} fill="var(--done-line)" />
                    <path d={`M${n.x - r - 1.5},${n.y - r + 3} l3,3 l5,-6`} stroke="#fff" strokeWidth={2} fill="none" />
                  </g>
                )}
                {n.t === "g" &&
                  wrapWords(n.l, 16).map((ln, i) => (
                    <text key={i} x={n.x} y={n.y + r + 17 + i * 14} textAnchor="middle" fontSize={13} style={soft}>
                      {ln}
                    </text>
                  ))}
              </g>
            );
          }
          if (n.t === "e" || n.t === "f" || n.t === "k") {
            const r = n.t === "k" ? KR : ER;
            const active = n.t === "f" && n.id === closedEndId;
            const fill = active ? "var(--done-fill)" : n.t === "e" ? "#C5E0B4" : n.t === "f" ? "#F4B6B6" : "#FFF2CC";
            const line = active ? "var(--done-line)" : n.t === "e" ? "#548235" : n.t === "f" ? "#C00000" : "#BF8F00";
            return (
              <g key={n.id} opacity={dimNode(n.id) ? DIM_OPACITY : 1}>
                <circle cx={n.x} cy={n.y} r={r} fill={fill} stroke={line} strokeWidth={n.t === "f" ? 4 : 2.6} />
                {active && (
                  <path
                    d={`M${n.x - 9},${n.y} L${n.x - 2},${n.y + 7} L${n.x + 10},${n.y - 8}`}
                    stroke="#fff"
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                )}
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
                <text x={n.x} y={n.y + r + 18} textAnchor="middle" fontSize={13} style={soft}>
                  {n.l}
                </text>
              </g>
            );
          }
          return null;
        })}
      </g>

      <DevTools cx={BY_ID.t18.x} top={BY_ID.t18.y + dims(BY_ID.t18).h / 2 + 18} />
    </svg>
  );
});

/* ================= decoración: herramientas de desarrollo ================= */

/** Íconos (solo visuales) de las herramientas habituales bajo "Desarrollar solución". */
function DevTools({ cx, top }: { cx: number; top: number }) {
  const tools = [
    { name: "Python", icon: <PythonMark /> },
    { name: "KNIME", icon: <KnimeMark /> },
    { name: "Power Automate", icon: <PowerAutomateMark /> },
    { name: "Power BI", icon: <PowerBiMark /> },
  ];
  const cell = 66;
  const w = cell * tools.length + 16;
  const x0 = cx - w / 2;
  return (
    <g aria-hidden>
      <rect
        x={x0}
        y={top}
        width={w}
        height={78}
        rx={10}
        style={{ fill: "var(--lane-head)", stroke: "var(--line)" }}
        strokeWidth={1.2}
      />
      <text x={cx} y={top + 15} textAnchor="middle" fontSize={10} fontWeight={700} letterSpacing={0.7} style={soft}>
        HERRAMIENTAS
      </text>
      {tools.map((t, i) => {
        const x = x0 + 8 + i * cell + cell / 2;
        return (
          <g key={t.name}>
            <g transform={`translate(${x - 14} ${top + 22}) scale(${28 / 24})`}>{t.icon}</g>
            <text x={x} y={top + 67} textAnchor="middle" fontSize={10} style={soft}>
              {t.name}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function PythonMark() {
  return (
    <>
      <path
        d="M11.9 2C8.1 2 8.3 3.7 8.3 3.7v1.8h3.7v.5H6.8S4.4 5.7 4.4 9.6s2.1 3.8 2.1 3.8h1.3v-1.8s-.1-2.1 2.1-2.1h3.6s2 0 2-2V4.3S15.8 2 11.9 2z"
        fill="#3776AB"
      />
      <circle cx="9.9" cy="3.9" r=".75" fill="#fff" />
      <path
        d="M12.1 22c3.8 0 3.6-1.7 3.6-1.7v-1.8H12v-.5h5.2s2.4.3 2.4-3.6-2.1-3.8-2.1-3.8h-1.3v1.8s.1 2.1-2.1 2.1h-3.6s-2 0-2 2v3.2S8.2 22 12.1 22z"
        fill="#FFD43B"
      />
      <circle cx="14.1" cy="20.1" r=".75" fill="#fff" />
    </>
  );
}

function KnimeMark() {
  return (
    <>
      <path d="M12 2.5 22 20H2z" fill="#FDD800" stroke="#C9A800" strokeWidth=".8" strokeLinejoin="round" />
      <path d="M12 8.5 16.5 16.5h-9z" fill="none" stroke="#6E5A00" strokeWidth="1.4" strokeLinejoin="round" />
    </>
  );
}

function PowerAutomateMark() {
  return (
    <>
      <path d="M2 5h9l6 7-6 7H2l6-7z" fill="#0F6CBD" />
      <path d="M10 5h6l6 7-6 7h-6l6-7z" fill="#50A0F0" />
    </>
  );
}

function PowerBiMark() {
  return (
    <>
      <rect x="3" y="12" width="4.5" height="9" rx="1.2" fill="#F2C811" />
      <rect x="9.75" y="7.5" width="4.5" height="13.5" rx="1.2" fill="#E8A600" />
      <rect x="16.5" y="3" width="4.5" height="18" rx="1.2" fill="#C98A00" />
    </>
  );
}
