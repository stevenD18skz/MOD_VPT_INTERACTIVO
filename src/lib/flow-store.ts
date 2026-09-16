// Biblioteca de flujos en el cliente.
// - Con Turso configurado ("remote"): la fuente de verdad es la base de datos; los cambios
//   se aplican al instante en pantalla y se envían en orden a las Server Actions.
// - Sin Turso ("local"): todo se guarda en localStorage, solo en este navegador.

import { useSyncExternalStore } from "react";
import {
  branchLock,
  gatewayBranches,
  upstreamSteps,
  type DocStatus,
  type Flow,
  type Material,
  type NodeState,
  type Status,
} from "./flow-definition";
import {
  addFileMaterial as remoteAddFile,
  addLinkMaterial as remoteAddLink,
  closeEnd as remoteCloseEnd,
  deleteMaterial as remoteDeleteMaterial,
  createFlow as remoteCreate,
  deleteFlow as remoteDelete,
  importFlows as remoteImport,
  reopenEnd as remoteReopenEnd,
  setDocLink as remoteSetDocLink,
  setDocStatus as remoteSetDocStatus,
  setGatewayAnswer as remoteSetGatewayAnswer,
  setNodeNote as remoteSetNote,
  setNodeStatus as remoteSetStatus,
  updateFlowInfo as remoteUpdateInfo,
} from "./flow-actions";

export type { Flow };
/** loading: leyendo · local: localStorage · remote: Turso · offline: no se pudo leer Turso */
export type Mode = "loading" | "local" | "remote" | "offline";
export type Sync = "idle" | "saving" | "error";

const KEY = "flujo-interactivo:flows:v1";
const BACKUP_KEY = "flujo-interactivo:flows:respaldo-local";

let flows: Flow[] | null = null;
let mode: Mode = "loading";
let sync: Sync = "idle";
/** Si se pueden subir archivos al material de apoyo (Turso + Vercel Blob configurados). */
let uploads = false;
let pending = 0;
let queue: Promise<unknown> = Promise.resolve();
let started = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function readLocal(): Flow[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(next: Flow[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}

type ApiResponse = { configured: boolean; uploads?: boolean; flows: Flow[] };

async function fetchFlows(): Promise<ApiResponse> {
  const res = await fetch("/api/flows", { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/flows ${res.status}`);
  return res.json();
}

async function load() {
  try {
    const data = await fetchFlows();
    uploads = Boolean(data.configured && data.uploads);
    if (!data.configured) {
      mode = "local";
      flows = readLocal();
    } else {
      // Primera vez con Turso: sube los flujos que solo existían en este navegador
      // y deja una copia de respaldo local por si acaso.
      const local = readLocal();
      const known = new Set(data.flows.map((f) => f.id));
      const missing = local.filter((f) => !known.has(f.id));
      if (missing.length) {
        await remoteImport(missing);
        data.flows.push(...missing);
      }
      if (local.length) {
        try {
          localStorage.setItem(BACKUP_KEY, JSON.stringify(local));
          localStorage.removeItem(KEY);
        } catch {}
      }
      mode = "remote";
      flows = data.flows;
    }
  } catch (e) {
    console.error("[flujos] no se pudo cargar", e);
    mode = "offline";
    flows = null;
  }
  emit();
}

/** Trae cambios hechos desde otro dispositivo al volver a la pestaña. */
async function refreshIfIdle() {
  if (mode !== "remote" || pending > 0 || sync === "error") return;
  try {
    const data = await fetchFlows();
    if (data.configured && pending === 0) {
      flows = data.flows;
      emit();
    }
  } catch {}
}

function start() {
  if (started) return;
  started = true;
  void load();
  window.addEventListener("focus", refreshIfIdle);
  window.addEventListener("storage", (e) => {
    if (mode === "local" && e.key === KEY) {
      flows = readLocal();
      emit();
    }
  });
  // Avisa antes de cerrar si todavía hay cambios viajando a la base de datos.
  window.addEventListener("beforeunload", (e) => {
    if (pending > 0) e.preventDefault();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

/** Vuelve a leer todo desde el servidor (botón "Reintentar"/"Recargar"). */
export function retry() {
  flows = null;
  mode = "loading";
  sync = "idle";
  emit();
  void load();
}

/** Lista de flujos; `null` mientras carga (o si no se pudo cargar: ver useStoreMode). */
export function useFlows(): Flow[] | null {
  return useSyncExternalStore(subscribe, () => flows, () => null);
}

export function useStoreMode(): Mode {
  return useSyncExternalStore(subscribe, () => mode, () => "loading" as Mode);
}

export function useSyncState(): Sync {
  return useSyncExternalStore(subscribe, () => sync, () => "idle" as Sync);
}

export function useUploadsEnabled(): boolean {
  return useSyncExternalStore(subscribe, () => uploads, () => false);
}

/* ================= mutaciones ================= */

function apply(next: Flow[]) {
  flows = next;
  if (mode === "local") writeLocal(next);
  emit();
}

/** Encola la escritura remota: se envían de una en una, en el orden en que ocurrieron. */
function persist(call: () => Promise<unknown>) {
  if (mode !== "remote") return;
  pending++;
  if (sync !== "error") sync = "saving";
  emit();
  queue = queue
    .then(call)
    .then(
      () => {
        pending--;
        if (pending === 0 && sync === "saving") sync = "idle";
      },
      (e) => {
        console.error("[flujos] no se pudo guardar", e);
        pending--;
        sync = "error";
      },
    )
    .finally(emit);
}

function updateFlow(id: string, fn: (f: Flow) => Flow) {
  if (!flows) return;
  apply(flows.map((f) => (f.id === id ? { ...fn(f), updatedAt: Date.now() } : f)));
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function createFlow(name: string, description: string): string {
  const now = Date.now();
  const flow: Flow = { id: newId(), name, description, createdAt: now, updatedAt: now, nodes: {}, links: {} };
  apply([...(flows ?? []), flow]);
  persist(() => remoteCreate(flow.id, name, description));
  return flow.id;
}

export function updateFlowInfo(id: string, name: string, description: string) {
  updateFlow(id, (f) => ({ ...f, name, description }));
  persist(() => remoteUpdateInfo(id, name, description));
}

export function deleteFlow(id: string) {
  if (!flows) return;
  apply(flows.filter((f) => f.id !== id));
  persist(() => remoteDelete(id));
}

export function setNodeStatus(id: string, nodeId: string, s: Status) {
  updateFlow(id, (f) => ({ ...f, nodes: { ...f.nodes, [nodeId]: { ...f.nodes[nodeId], s } } }));
  persist(() => remoteSetStatus(id, nodeId, s));
}

export function setNodeNote(id: string, nodeId: string, n: string) {
  updateFlow(id, (f) => ({ ...f, nodes: { ...f.nodes, [nodeId]: { ...f.nodes[nodeId], n } } }));
  persist(() => remoteSetNote(id, nodeId, n));
}

/** Guarda (o quita, con `null`) el enlace de un documento. */
export function setDocLink(id: string, docKey: string, url: string | null) {
  updateFlow(id, (f) => {
    const links = { ...f.links };
    if (url) links[docKey] = url;
    else delete links[docKey];
    return { ...f, links };
  });
  persist(() => remoteSetDocLink(id, docKey, url));
}

/* ================= material de apoyo ================= */

function addMaterial(flowId: string, m: Material) {
  updateFlow(flowId, (f) => ({ ...f, materials: [...(f.materials ?? []), m] }));
}

export function addLinkMaterial(flowId: string, title: string, url: string) {
  const m: Material = { id: newId(), kind: "link", title, url, createdAt: Date.now() };
  addMaterial(flowId, m);
  persist(() => remoteAddLink(flowId, m.id, title, url));
}

/** Registra un archivo ya subido al Blob (ver MaterialPanel). */
export function addFileMaterial(
  flowId: string,
  file: { title: string; url: string; size: number; contentType: string },
) {
  const m: Material = { id: newId(), kind: "file", ...file, createdAt: Date.now() };
  addMaterial(flowId, m);
  persist(() => remoteAddFile(flowId, m.id, file));
}

export function removeMaterial(flowId: string, id: string) {
  updateFlow(flowId, (f) => ({ ...f, materials: (f.materials ?? []).filter((m) => m.id !== id) }));
  persist(() => remoteDeleteMaterial(flowId, id));
}

/** Estado de un documento ("empty" = vacío, se guarda quitando la clave). */
export function setDocStatus(id: string, docKey: string, status: DocStatus) {
  updateFlow(id, (f) => {
    const docs = { ...f.docs };
    if (status === "empty") delete docs[docKey];
    else docs[docKey] = status;
    return { ...f, docs };
  });
  persist(() => remoteSetDocStatus(id, docKey, status));
}

/* ================= finales del flujo ================= */
// Un flujo solo puede estar cerrado por un final a la vez: representa una sola
// ejecución real de la automatización. Cerrar guarda cómo estaban los pasos del
// camino justo antes, para que reabrir los devuelva exactamente a eso.

/** Cierra un final: la automatización "llegó hasta aquí", así que sus pasos previos pasan a Done. */
export function closeEnd(flowId: string, endId: string) {
  const stepIds = upstreamSteps(endId);
  updateFlow(flowId, (f) => {
    const snapshot: Record<string, NodeState> = {};
    for (const id of stepIds) snapshot[id] = f.nodes[id] ?? {};
    return {
      ...f,
      nodes: {
        ...f.nodes,
        ...Object.fromEntries(stepIds.map((id) => [id, { ...f.nodes[id], s: "done" as Status }])),
      },
      closed: { endId, snapshot },
    };
  });
  persist(() => remoteCloseEnd(flowId, endId));
}

/** Reabre el final activo: restaura los pasos de su camino a como estaban antes de cerrarlo. */
export function reopenEnd(flowId: string, endId: string) {
  updateFlow(flowId, (f) => {
    if (!f.closed || f.closed.endId !== endId) return f;
    return { ...f, nodes: { ...f.nodes, ...f.closed.snapshot }, closed: null };
  });
  persist(() => remoteReopenEnd(flowId, endId));
}

/* ================= compuertas (Sí/No…) ================= */

/**
 * Respuesta de una compuerta que NO lleva directo a un final (`target: null` la
 * borra). Responder implica que ya se completaron los pasos previos que llevaron
 * hasta acá, así que se marcan "done" (salvo los que pertenecen exclusivamente a
 * la rama que NO se tomó, que quedan bloqueados en vez de completados).
 */
export function setGatewayAnswer(flowId: string, gatewayId: string, target: string | null) {
  updateFlow(flowId, (f) => {
    const gatewayAnswers = { ...f.gatewayAnswers };
    if (target) gatewayAnswers[gatewayId] = target;
    else delete gatewayAnswers[gatewayId];
    if (!target) return { ...f, gatewayAnswers };
    const other = gatewayBranches(gatewayId).find((b) => b.target !== target);
    const discarded = other ? branchLock(other.target) : new Set<string>();
    // La rama elegida también se excluye: en un rework-loop (p. ej. "No, hay que
    // corregir") el paso de corrección es ancestro de la compuerta por el ciclo,
    // pero todavía no ocurrió esta vuelta, así que no debe marcarse "done".
    const chosenForward = branchLock(target);
    const toMarkDone = upstreamSteps(gatewayId).filter((id) => !discarded.has(id) && !chosenForward.has(id));
    const nodes = { ...f.nodes };
    for (const id of toMarkDone) nodes[id] = { ...nodes[id], s: "done" as Status };
    return { ...f, gatewayAnswers, nodes };
  });
  persist(() => remoteSetGatewayAnswer(flowId, gatewayId, target));
}
