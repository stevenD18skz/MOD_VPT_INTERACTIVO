// Biblioteca de flujos en el cliente.
// - Con Turso configurado ("remote"): la fuente de verdad es la base de datos; los cambios
//   se aplican al instante en pantalla y se envían en orden a las Server Actions.
// - Sin Turso ("local"): todo se guarda en localStorage, solo en este navegador.

import { useSyncExternalStore } from "react";
import type { Flow, Status } from "./flow-definition";
import {
  createFlow as remoteCreate,
  deleteFlow as remoteDelete,
  importFlows as remoteImport,
  setDocLink as remoteSetDocLink,
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

type ApiResponse = { configured: boolean; flows: Flow[] };

async function fetchFlows(): Promise<ApiResponse> {
  const res = await fetch("/api/flows", { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/flows ${res.status}`);
  return res.json();
}

async function load() {
  try {
    const data = await fetchFlows();
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
